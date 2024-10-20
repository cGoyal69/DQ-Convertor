// Helper function to stringify arguments
function stringifyArg(arg) {
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        return `{ ${Object.entries(arg).map(([key, value]) => `${key}: ${stringifyArg(value)}`).join(', ')} }`;
    } else if (Array.isArray(arg)) {
        return `[ ${arg.map(stringifyArg).join(', ')} ]`;
    } else if (typeof arg === 'string' && !arg.startsWith('"')) {
        return arg;  // Return variables and operators as-is
    } else {
        return JSON.stringify(arg);
    }
}

// Main function to convert JSON to MongoDB query
function jsonToMongo(Json) {
    const json = typeof Json === 'string' ? JSON.parse(Json) : Json;
    let queryString = `db.${json.collection}.`;
    const args = [];

    switch (json.operation) {
        case 'find':
        case 'findOne':
            queryString += `${json.operation}(`;
            args.push(json.filter || {});
            if (json.projection) args.push(json.projection);
            break;
        case 'aggregate':
            queryString += 'aggregate(';
            args.push(json.pipeline);
            break;
        case 'insert':
        case 'insertOne':
            queryString += 'insertOne(';
            args.push(Array.isArray(json.documents) ? json.documents[0] : json.document);
            break;
        case 'insertMany':
            queryString += 'insertMany(';
            args.push(json.documents);
            break;
        case 'update':
        case 'updateOne':
        case 'updateMany':
            queryString += (json.operation === 'updateMany' ? 'updateMany(' : 'updateOne(');
            args.push(json.filter, json.update);
            break;
        case 'delete':
        case 'deleteOne':
        case 'deleteMany':
            queryString += (json.operation === 'deleteMany' ? 'deleteMany(' : 'deleteOne(');
            args.push(json.filter);
            break;
        case 'createTable':
            queryString = `db.createCollection("${json.tableName}", { validator: { $jsonSchema: { bsonType: "object", required: [`;
            json.columns.forEach((column, index) => {
                queryString += `"${column.name}"`;
                if (index < json.columns.length - 1) {
                    queryString += ', ';
                }
            });
            queryString += `], properties: {`;
            json.columns.forEach((column, index) => {
                queryString += `"${column.name}": { bsonType: "${column.type}" }`;
                if (index < json.columns.length - 1) {
                    queryString += ', ';
                }
            });
            queryString += `} } } })`;
            return queryString;
        default:
            throw new Error(`Unsupported operation: ${json.operation}`);
    }

    queryString += args.map(arg => stringifyArg(arg)).join(', ');
    queryString += ')';

    if (json.limit !== undefined) {
        queryString += `.limit(${json.limit})`;
    }
    
    if (json.sort !== undefined) {
        queryString += `.sort(${stringifyArg(json.sort)})`;
    }

    if (json.map) {
        queryString += `.map(${json.map})`;
    }

    return queryString;
}

// Function to process multiple queries
function processQueries(queries) {
    if (!Array.isArray(queries)) {
        throw new Error("Input should be an array of queries.");
    }

    const nestedQueries = {};
    const mainQueries = [];

    queries.forEach(query => {
        const parsedQuery = typeof query === 'string' ? JSON.parse(query) : query;
        if (parsedQuery._id) {
            nestedQueries[parsedQuery._id] = parsedQuery;
        } else {
            mainQueries.push(parsedQuery);
        }
    });

    let result = [];
    mainQueries.forEach(query => {
        if (query.filter && typeof query.filter === 'object') {
            Object.entries(query.filter).forEach(([key, value]) => {
                if (typeof value === 'object' && value !== null && '$ref' in value) {
                    const refId = value['$ref'];
                    if (refId in nestedQueries) {
                        const nestedQuery = nestedQueries[refId];
                        const variableName = `${nestedQuery.collection}Ids`;
                        
                        // First query to get IDs
                        const idQuery = {
                            ...nestedQuery,
                            projection: { _id: 1 },
                            map: `${nestedQuery.collection} => ${nestedQuery.collection}._id`
                        };
                        result.push(`const ${variableName} = ${jsonToMongo(idQuery)};`);
                        
                        // Update the main query to use the IDs
                        query.filter[key] = { $in: variableName };
                    }
                }
            });
        }
        try {
            result.push(jsonToMongo(query));
        } catch (error) {
            console.error(`Error processing query: ${error.message}`);
        }
    });

    return result;
}

// Function to convert nested queries to MongoDB queries
function convertToMongoDBQuery(nestedQuery) {
    let mongoDBQuery = '';
    nestedQuery = typeof nestedQuery === 'string' ? JSON.parse(nestedQuery) : nestedQuery;

    const stringifyObject = (obj) => {
        return JSON.stringify(obj, null, 2).replace(/"([^"]+)":/g, '$1:');
    };

    const processFind = (query) => {
        const resultVar = `result_${Math.random().toString(36).substr(2, 9)}`;
        mongoDBQuery += `var ${resultVar} = db.${query.collection}.find(\n`;
        mongoDBQuery += `  ${stringifyObject(query.filter || {})},\n`;
        mongoDBQuery += `  ${stringifyObject(query.projection || {})}\n`;
        mongoDBQuery += `).toArray();\n`;
        return resultVar;
    };

    const processAggregate = (query) => {
        mongoDBQuery += `db.${query.collection}.aggregate([\n`;

        query.pipeline.forEach((stage, index) => {
            if (stage.$match) {
                Object.keys(stage.$match).forEach(key => {
                    if (stage.$match[key].$in && typeof stage.$match[key].$in[0] === 'object') {
                        const nestedQueryItem = stage.$match[key].$in[0];
                        if (nestedQueryItem.operation === 'find') {
                            const resultVariable = processFind(nestedQueryItem);
                            mongoDBQuery += `var ${key}s = ${resultVariable}.map(item => item.${key});\n`;
                            stage.$match[key].$in = `${key}s`;
                        }
                    }
                });
                mongoDBQuery += `  { $match: ${stringifyObject(stage.$match)} },\n`;
            }
            if (stage.$project) {
                mongoDBQuery += `  { $project: ${stringifyObject(stage.$project)} },\n`;
            }
        });

        mongoDBQuery = mongoDBQuery.slice(0, -2) + '\n'; // Remove last comma
        mongoDBQuery += `]);\n`;
    };

    const processUpdate = (query) => {
        const filterKeys = Object.keys(query.filter);
        const nestedKey = filterKeys.find(key => query.filter[key].$in && typeof query.filter[key].$in[0] === 'object');

        if (nestedKey) {
            const nestedQueryItem = query.filter[nestedKey].$in[0];
            if (nestedQueryItem.operation === 'find') {
                const resultVariable = processFind(nestedQueryItem);
                mongoDBQuery += `db.${query.collection}.updateMany(\n`;
                mongoDBQuery += `  { ${nestedKey}: { $in: ${resultVariable}.map(item => item.${nestedKey}) } },\n`;
                mongoDBQuery += `  ${stringifyObject(query.update)}\n`;
                mongoDBQuery += `);\n`;
            }
        }
    };

    const processDelete = (query) => {
        const filterKeys = Object.keys(query.filter);
        const nestedKey = filterKeys.find(key => query.filter[key].$in && typeof query.filter[key].$in[0] === 'object');

        if (nestedKey) {
            const nestedQueryItem = query.filter[nestedKey].$in[0];
            if (nestedQueryItem.operation === 'find') {
                const resultVariable = processFind(nestedQueryItem);
                mongoDBQuery += `db.${query.collection}.deleteMany(\n`;
                mongoDBQuery += `  { ${nestedKey}: { $in: ${resultVariable}.map(item => item.${nestedKey}) } }\n`;
                mongoDBQuery += `);\n`;
            }
        }
    };

    switch (nestedQuery.operation) {
        case 'aggregate':
            processAggregate(nestedQuery);
            break;
        case 'find':
            processFind(nestedQuery);
            break;
        case 'updateMany':
            processUpdate(nestedQuery);
            break;
        case 'deleteMany':
            processDelete(nestedQuery);
            break;
        default:
            throw new Error('Unsupported operation');
    }

    return mongoDBQuery;
}

// Function to process nested queries
function processNestedQuery(json) {
    const result = [];
    const nestedQueries = findNestedQueries(json);

    for (const [path, nestedQuery] of nestedQueries) {
        const variableName = `${nestedQuery.collection}Ids`;
        const nestedQueryString = convertToMongoDBQuery(nestedQuery);
        result.push(nestedQueryString);

        // Update the main query to use the results of the nested query
        const pathParts = path.split('.');
        let current = json;
        for (let i = 0; i < pathParts.length - 1; i++) {
            current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = { $in: variableName };
    }

    result.push(jsonToMongo(json)); // Convert the main query after updating with nested query results
    return result.join('\n');
}

// Helper function to find nested queries
function findNestedQueries(obj, path = '') {
    const result = [];
    for (const [key, value] of Object.entries(obj)) {
        const newPath = path ? `${path}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
            if ('operation' in value && 'collection' in value) {
                result.push([newPath, value]);
            } else {
                result.push(...findNestedQueries(value, newPath));
            }
        }
    }
    return result;
}


const nestedAggregateQuery = `{
    "operation": "aggregate",
    "collection": "employees",
    "pipeline": [
      {
        "$match": {
          "name": {
            "$in": [
              {
                "operation": "find",
                "collection": "heros",
                "projection": {
                  "name": 1
                }
              }
            ]
          }
        }
      },
      {
        "$project": {
          "first_name": 1,
          "last_name": 1,
          "salary": 1
        }
      }
    ]
    }`;
    
    const nestedDeleteQuery = `{
    "operation": "deleteMany",
    "collection": "users",
    "filter": {
      "order_id": {
        "$in": [
          {
            "operation": "find",
            "collection": "order_items",
            "projection": {
              "order_id": 1
            },
            "filter": {
              "$and": [
                {
                  "product_id": {
                    "$eq": 123
                  }
                },
                {
                  "name": {
                    "$in": [
                      "Kavyaa",
                      "Lakshita",
                      "Cou"
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
    }`;
    
    console.log(processNestedQuery(nestedAggregateQuery));
    console.log(processNestedQuery(nestedDeleteQuery));
    

module.exports = { jsonToMongo, processQueries, processNestedQuery, convertToMongoDBQuery };