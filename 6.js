
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
    return typeMapping [baseSqlType] || 'string';
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

// Example usage
const intermediateJson = {
    "operation": "createTable",
    "tableName": "users",
    "columns": [
      {
        "name": "CREATE",
        "type": "TABLE",
        "constraints": []
      },
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
  };
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
    }]

convertIntermediateJsonToMongo(intermediateJson);
convertIntermediateJsonToMongo(examples)