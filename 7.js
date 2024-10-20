function sqlToIntermediateJson(sqlCommand) {
    // Extract table name
    const tableNameMatch = sqlCommand.match(/CREATE TABLE (\w+)/i);
    const tableName = tableNameMatch ? tableNameMatch[1] : null;

    if (!tableName) {
        throw new Error("Invalid SQL: Unable to extract table name");
    }

    // Extract column definitions
    const columnRegex = /(\w+)\s+(\w+(?:\(\d+\))?)\s*([^,\n]+)?/g;
    const columns = [...sqlCommand.matchAll(columnRegex)];

    const intermediateJson = {
        operation: "createTable",
        tableName: tableName,
        columns: []
    };

    let hasPrimaryKey = false;

    columns.forEach(column => {
        const [, name, dataType, constraintsStr] = column;
        const columnDef = {
            name: name,
            type: dataType.toUpperCase(),
            constraints: []
        };

        if (constraintsStr) {
            if (/NOT NULL/i.test(constraintsStr)) {
                columnDef.constraints.push("NOT NULL");
            }
            if (/UNIQUE/i.test(constraintsStr)) {
                columnDef.constraints.push("UNIQUE");
            }
            if (/PRIMARY KEY/i.test(constraintsStr)) {
                if (hasPrimaryKey) {
                    throw new Error("Multiple primary keys are not supported");
                }
                hasPrimaryKey = true;
                columnDef.constraints.push("PRIMARY KEY");
            }
            // Add checks for other constraints here
        }

        intermediateJson.columns.push(columnDef);
    });

    // Add _id field if no primary key was specified
    if (!hasPrimaryKey) {
        intermediateJson.columns.unshift({
            name: "_id",
            type: "VARCHAR(24)",
            constraints: ["NOT NULL", "PRIMARY KEY"]
        });
    }

    return intermediateJson;
}

function createCollec(sqlCommand) {
    return sqlToIntermediateJson(sqlCommand);
}

// Example usage
const sqlCommand = `
CREATE TABLE users (
    id INT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    age INT,
    created_at TIMESTAMP
);
`;

console.log(JSON.stringify(createCollec(sqlCommand), null, 2));
