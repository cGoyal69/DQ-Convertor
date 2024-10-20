function jsonToMongo(Json) {
    const json = typeof Json === 'string' ? JSON.parse(Json) : Json;
    let queryString = `db.${json.collection}.`;
    const args = [];

    switch (json.operation) {
        case 'find':
        case 'findOne':
            queryString += json.operation + '(';
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
            createCollec(json);  // Pass json directly
            return;  // Exit the function after handling createTable
        default:
            throw new Error(`Unsupported operation: ${json.operation}`);
    }

    if (json.operation !== 'createTable') {
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
    }

    return queryString;
}

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

function processQueries(queries) {
    // Ensure queries is an array
    if (!Array.isArray(queries)) {
        throw new Error("Input should be an array of queries.");
    }

    const nestedQueries = {};
    const mainQueries = [];

    queries.forEach(query => {
        const parsedQuery = JSON.parse(query);
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

function processNestedQuery(json) {
    const result = [];
    const nestedQueries = findNestedQueries(json);

    for (const [path, nestedQuery] of nestedQueries) {
        const variableName = `${nestedQuery.collection}Ids`;
        const nestedQueryString = jsonToMongo(nestedQuery);
        result.push(`const ${variableName} = ${nestedQueryString}.map(${nestedQuery.collection} => ${nestedQuery.collection}._id);`);
    }

    result.push(jsonToMongo(json));
    return result.join('\n');
}

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

function createCollec(x){
    function intermediateJsonToMongoSchema(intermediateJson) {
        const mongoSchema = {
            collection: intermediateJson.tableName,
            validator: {
                $jsonSchema: {
                    bsonType: "object",
                    required: [],
                    properties: {}
                }
            }
        };
    
        intermediateJson.columns.forEach(column => {
            if (column.name === '_id') return; // Skip _id field
    
            const field = { bsonType: sqlTypeToMongo(column.type) };
    
            if (column.constraints.includes("NOT NULL")) {
                mongoSchema.validator.$jsonSchema.required.push(column.name);
            }
            if (column.constraints.includes("UNIQUE")) {
                field.unique = true;
            }
    
            mongoSchema.validator.$jsonSchema.properties[column.name] = field;
        });
    
        return mongoSchema;
    }
    
    function sqlTypeToMongo(sqlType) {
        const typeMapping = {
            'INT': 'int',
            'INTEGER': 'int',
            'BIGINT': 'long',
            'FLOAT': 'double',
            'DOUBLE': 'double',
            'DECIMAL': 'decimal',
            'CHAR': 'string',
            'VARCHAR': 'string',
            'TEXT': 'string',
            'DATE': 'date',
            'DATETIME': 'date',
            'TIMESTAMP': 'timestamp',
            'BOOLEAN': 'bool',
        };
        const baseSqlType = sqlType.split('(')[0].toUpperCase();
        return typeMapping[baseSqlType] || 'string';
    }
    
    function convertIntermediateJsonToMongo(intermediateJson) {
        try {
            const mongoSchema = intermediateJsonToMongoSchema(intermediateJson);
            console.log("MongoDB Schema:");
            console.log(JSON.stringify(mongoSchema, null, 2));
    
            const createCommand = `db.createCollection("${mongoSchema.collection}", ${JSON.stringify({ validator: mongoSchema.validator }, null, 2)})`;
            console.log("\nMongoDB Create Collection Command:");
            console.log(createCommand);
        } catch (error) {
            console.error("Error:", error.message);
        }
    }
    return convertIntermediateJsonToMongo(x);
}

// Example usage
const examples = [
    `{
        "operation": "createTable",
        "tableName": "users",
        "columns": [
            {
                "name": "id",
                "type": "INT",
                "constraints": [
                    "PRIMARY KEY"
                ]
            },
            {
                "name": "username",
                "type": "VARCHAR(50)",
                "constraints": [
                    "NOT NULL",
                    "UNIQUE"
                ]
            },
            {
                "name": "email",
                "type": "VARCHAR(100)",
                "constraints": [
                    "NOT NULL",
                    "UNIQUE"
                ]
            },
            {
                "name": "age",
                "type": "INT",
                "constraints": []
            },
            {
                "name": "created_at",
                "type": "TIMESTAMP",
                "constraints": []
            }
        ]
    }`
];

const exampleInsert = `{
    "collection": "products",
    "operation": "insertMany",
    "documents": [
      {"name": "Product1", "price": 120, "category": "electronics"},
      {"name": "Product2", "price": 80, "category": "clothing"}
    ]
  }`;
  
  const exampleFind = `{
    "collection": "products",
    "operation": "find",
    "filter": {"category": "electronics"},
    "projection": {"name": 1, "price": 1},
    "sort": {"price": -1},
    "limit": 10
  }`;
  
  const exampleUpdate = `{
    "operation": "update",
    "collection": "products",
    "update": {"$set": {"avg_price": 150}},
    "filter": {"avg_price": {"$nin": 100}}
  }`;
  
  const exampleDelete = `{
    "operation": "delete",
    "collection": "users",
    "filter": {"age": {"$ne": 20}}
  }`;
  
  const exampleCreateTable = `{
    "operation": "createTable",
    "tableName": "users",
    "columns": [
      {"name": "id", "type": "int", "constraints": ["PRIMARY KEY", "AUTO_INCREMENT"]},
      {"name": "name", "type": "varchar(100)", "constraints": []},
      {"name": "age", "type": "int", "constraints": []}
    ]
  }`;
  
  const exampleDropTable = `{
    "operation": "dropTable",
    "tableName": "users"
  }`;
  

console.log(jsonToMongo(examples));

module.exports = { jsonToMongo, processQueries, processNestedQuery };