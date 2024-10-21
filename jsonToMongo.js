const jsonToMongo = (input) => {
    if (typeof input === 'string') {
        try {
            input = JSON.parse(input);
        } catch (error) {
            throw new Error('Invalid JSON input');
        }
    }

    if (Array.isArray(input)) {
        return processQueries(input);
    } else if (typeof input === 'object' && input !== null) {
        return processSingleQuery(input);
    } else {
        throw new Error('Invalid input type. Expected JSON object or array of JSON objects.');
    }
};

const processSingleQuery = (json) => {
    if (json.operation === 'createTable') {
        return createCollection(json);
    } else {
        return convertToMongoDBQuery(json);
    }
};

const convertToMongoDBQuery = (query) => {
    let mongoDBQuery = '';

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

        query.pipeline.forEach((stage) => {
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
            if (stage.$group) {
                mongoDBQuery += `  { $group: ${stringifyObject(stage.$group)} },\n`;
            }
            // Add other stages as needed
        });

        mongoDBQuery = mongoDBQuery.slice(0, -2) + '\n'; // Remove last comma
        mongoDBQuery += `]);\n`;
    };

    // ... (rest of the code remains the same)


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
        } else {
            mongoDBQuery += `db.${query.collection}.${query.operation === 'updateMany' ? 'updateMany' : 'updateOne'}(\n`;
            mongoDBQuery += `  ${stringifyObject(query.filter)},\n`;
            mongoDBQuery += `  ${stringifyObject(query.update)}\n`;
            mongoDBQuery += `);\n`;
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
        } else {
            mongoDBQuery += `db.${query.collection}.${query.operation === 'deleteMany' ? 'deleteMany' : 'deleteOne'}(\n`;
            mongoDBQuery += `  ${stringifyObject(query.filter)}\n`;
            mongoDBQuery += `);\n`;
        }
    };

    const processInsert = (query) => {
        if (query.operation === 'insertMany') {
            mongoDBQuery += `db.${query.collection}.insertMany(\n`;
            mongoDBQuery += `  ${stringifyObject(query.documents)}\n`;
            mongoDBQuery += `);\n`;
        } else {
            mongoDBQuery += `db.${query.collection}.insertOne(\n`;
            mongoDBQuery += `  ${stringifyObject(query.document || query.documents[0])}\n`;
            mongoDBQuery += `);\n`;
        }
    };

    switch (query.operation) {
        case 'aggregate':
            processAggregate(query);
            break;
        case 'find':
        case 'findOne':
            processFind(query);
            break;
        case 'update':
        case 'updateOne':
        case 'updateMany':
            processUpdate(query);
            break;
        case 'delete':
        case 'deleteOne':
        case 'deleteMany':
            processDelete(query);
            break;
        case 'insert':
        case 'insertOne':
        case 'insertMany':
            processInsert(query);
            break;
        default:
            throw new Error('Unsupported operation');
    }

    return mongoDBQuery;
};

const processQueries = (queries) => {
    return queries.map(query => processSingleQuery(query)).join('\n');
};

const createCollection = (json) => {
    const mongoSchema = {
        bsonType: "object",
        required: [],
        properties: {}
    };

    json.columns.forEach(column => {
        if (column.name === '_id') return;

        const field = { bsonType: sqlTypeToMongo(column.type) };

        if (column.constraints.includes("NOT NULL")) {
            mongoSchema.required.push(column.name);
        }
        if (column.constraints.includes("UNIQUE")) {
            field.unique = true;
        }

        mongoSchema.properties[column.name] = field;
    });

    const createCommand = `db.createCollection("${json.tableName}", {\n  validator: {\n    $jsonSchema: ${JSON.stringify(mongoSchema, null, 2)}\n  }\n})`;
    return createCommand;
};

const sqlTypeToMongo = (sqlType) => {
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
};

// Example usage
const examples = [
    {
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
    },
    {
        "operation": "aggregate",
        "collection": "employees",
        "pipeline": [
            {
                "$match": {
                    "name": {
                        "$in": [
                            "a", "b"
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
    },
    {
        "operation": "deleteMany",
        "collection": "users",
        "filter": {
            "username": {
                "$in": [
                    {
                        "operation": "find",
                        "collection": "employees",
                        "filter": {
                            "salary": { "$gt": 5000 }
                        }
                    }
                ]
            }
        }
    },
    {
        "operation": "aggregate",
        "collection": "employees",
        "pipeline": [
          {
            "$match": {
              "department_id": {
                "$in": [
                  {
                    "operation": "find",
                    "collection": "departments",
                    "projection": {
                      "department_id": 1
                    },
                    "filter": {
                      "department_name": {
                        "$eq": "HR"
                      }
                    }
                  }
                ]
              }
            }
          },
          {
            "$project": {
              "*": 1
            }
          }
        ]
      }
];

// Example execution
try {
    const result = jsonToMongo(examples);
    console.log(result);
} catch (error) {
    console.error(error.message);
}
