function sqlToMongoSchema(sqlCommand) {
    // Extract table name
    const tableNameMatch = sqlCommand.match(/CREATE TABLE (\w+)/i);
    const tableName = tableNameMatch ? tableNameMatch[1] : null;

    if (!tableName) {
        throw new Error("Invalid SQL: Unable to extract table name");
    }

    // Extract column definitions
    const columnRegex = /(\w+)\s+(\w+(?:\(\d+\))?)\s*([^,\n]+)?/g;
    const columns = [...sqlCommand.matchAll(columnRegex)];

    const mongoSchema = {
        collection: tableName,
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: [],
                properties: {}
            }
        }
    };

    let hasPrimaryKey = false;

    columns.forEach(column => {
        const [, name, dataType, constraints] = column;
        const field = { bsonType: sqlTypeToMongo(dataType) };

        // Check for unsupported features
        if (constraints) {
            if (/FOREIGN KEY/i.test(constraints)) {
                throw new Error(`Foreign keys are not supported in MongoDB: ${name}`);
            }
            if (/CHECK/i.test(constraints)) {
                throw new Error(`CHECK constraints are not supported in MongoDB: ${name}`);
            }
            if (/DEFAULT/i.test(constraints) && !/NULL/i.test(constraints)) {
                throw new Error(`DEFAULT values are not supported in this conversion: ${name}`);
            }
            if (/AUTO_INCREMENT/i.test(constraints)) {
                throw new Error(`AUTO_INCREMENT is not supported in MongoDB: ${name}`);
            }

            if (/NOT NULL/i.test(constraints)) {
                mongoSchema.validator.$jsonSchema.required.push(name);
            }
            if (/UNIQUE/i.test(constraints)) {
                field.unique = true;
            }
            if (/PRIMARY KEY/i.test(constraints)) {
                if (hasPrimaryKey) {
                    throw new Error("Multiple primary keys are not supported in MongoDB");
                }
                hasPrimaryKey = true;
                // Skip this field as we'll use _id for the primary key
                return;
            }
        }

        mongoSchema.validator.$jsonSchema.properties[name] = field;
    });

    // Add _id field if no primary key was specified
    if (!hasPrimaryKey) {
        mongoSchema.validator.$jsonSchema.properties._id = { bsonType: "objectId" };
    }

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

function convertSqlToMongo(sqlCommand) {
    try {
        const mongoSchema = sqlToMongoSchema(sqlCommand);
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
const sqlCommand = `
CREATE TABLE users (
    id INT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, 
    email VARCHAR(100) UNIQUE NOT NULL, 
    age INT, 
    created_at TIMESTAMP
);
`;

convertSqlToMongo(sqlCommand);