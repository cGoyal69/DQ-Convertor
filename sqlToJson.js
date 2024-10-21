const parseValue = (value) => {
    value = value.trim();
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    if (!isNaN(value)) return Number(value);
    if (value.toLowerCase() === 'null') return null;
    if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') return value.toLowerCase() === 'true';
    return value;
};

const parseProjection = (columns) => {
    if (columns.trim() === '*') return {};
    const projection = {};
    columns.split(',').forEach(col => {
        col = col.trim();
        if (col !== '*') projection[col] = 1;
    });
    return projection;
};

const parseFrom = (from) => from.split(/\s+/)[0].trim();

const parseOrderBy = (orderBy) => {
    const sort = {};
    orderBy.split(',').forEach(item => {
        const [col, direction] = item.trim().split(/\s+/);
        sort[col] = direction && direction.toUpperCase() === 'DESC' ? -1 : 1;
    });
    return sort;
};

const parseSetClause = (setClause) => {
    const result = {};
    const assignments = setClause.split(',');
    for (const assignment of assignments) {
        const [column, value] = assignment.split('=');
        if (!column || value === undefined) {
            throw new Error(`Invalid SET clause: ${assignment}`);
        }
        result[column.trim()] = parseValue(value.trim());
    }
    return result;
};

const parseInsertValues = (columns, valuesList) => {
    const columnNames = columns ? columns.split(',').map(col => col.trim()) : null;
    const valueGroups = valuesList.match(/\(.*?\)/g);
    
    return valueGroups.map(group => {
        const values = group.slice(1, -1).split(',').map(val => parseValue(val.trim()));
        const document = {};
        if (columnNames) {
            columnNames.forEach((col, index) => {
                document[col] = values[index];
            });
        } else {
            values.forEach((value, index) => {
                document[`field${index + 1}`] = value;
            });
        }
        return document;
    });
};

const parseAggregateExpression = (expr) => {
    const aggregateFunctions = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'];
    for (const func of aggregateFunctions) {
        if (expr.toUpperCase().startsWith(func)) {
            const field = expr.slice(func.length + 1, -1).trim();
            return { [`$${func.toLowerCase()}`]: `$${field}` };
        }
    }
    return `$${expr}`;
};

const parseCondition = (condition) => {
    const nestedQueryRegex = /(\w+)\s+IN\s+\((SELECT\s+.*?)\)/i;
    const nestedMatch = condition.match(nestedQueryRegex);
    if (nestedMatch) {
        const [, field, nestedQuery] = nestedMatch;
        const convertedNestedQuery = sqlToJson(nestedQuery);
        return {
            [field]: {
                $in: convertedNestedQuery.operation === "find" ? [convertedNestedQuery] : convertedNestedQuery
            }
        };
    }

    const logicalOperators = ['AND', 'OR'];
    for (const op of logicalOperators) {
        if (condition.toUpperCase().includes(` ${op} `)) {
            const parts = condition.split(new RegExp(`\\s${op}\\s`, 'i'));
            const mongoOp = op === 'AND' ? '$and' : '$or';
            return { [mongoOp]: parts.map(part => parseCondition(part.trim())) };
        }
    }

    const operatorMap = {
        '=': '$eq', '!=': '$ne', '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte',
        'LIKE': '$regex', 'NOT LIKE': '$not', 'IN': '$in', 'NOT IN': '$nin',
        'IS NULL': null, 'IS NOT NULL': { $ne: null }
    };

    for (const [sqlOp, mongoOp] of Object.entries(operatorMap)) {
        if (condition.toUpperCase().includes(sqlOp)) {
            let [left, right] = condition.split(new RegExp(`\\s*${sqlOp}\\s*`, 'i'));
            left = left.trim();
            right = right ? parseValue(right.trim()) : null;

            if (sqlOp === 'LIKE' || sqlOp === 'NOT LIKE') {
                right = new RegExp('^' + right.replace(/%/g, '.*') + '$');
                return sqlOp === 'LIKE' 
                    ? { [left]: { $regex: right } }
                    : { [left]: { $not: { $regex: right } } };
            } else if (sqlOp === 'IN' || sqlOp === 'NOT IN') {
                right = right.slice(1, -1).split(',').map(item => parseValue(item.trim()));
            } else if (sqlOp === 'IS NULL') {
                return { [left]: { $eq: null } };
            } else if (sqlOp === 'IS NOT NULL') {
                return { [left]: { $ne: null } };
            }

            return { [left]: { [mongoOp]: right } };
        }
    }
    return condition.trim();
};

// Main query handling functions
const handleSelect = (query) => {
    const regex = /SELECT\s+(.*?)\s+FROM\s+(.*?)(?:\s+WHERE\s+(.*?))?(?:\s+GROUP\s+BY\s+(.*?))?(?:\s+HAVING\s+(.*?))?(?:\s+ORDER\s+BY\s+(.*?))?(?:\s+LIMIT\s+(\d+))?(?:\s+OFFSET\s+(\d+))?$/is;
    const match = query.match(regex);

    if (!match) {
        throw new Error("Invalid SELECT query");
    }

    const [, columns, from, where, groupBy, having, orderBy, limit, offset] = match;

    if (groupBy || having || hasSubquery(query)) {
        return handleComplexSelect(columns, from, where, groupBy, having, orderBy, limit, offset);
    }

    const result = {
        operation: "find",
        collection: parseFrom(from),
        projection: parseProjection(columns),
    };

    if (where) result.filter = parseCondition(where);
    if (orderBy) result.sort = parseOrderBy(orderBy);
    if (limit) result.limit = parseInt(limit);
    if (offset) result.skip = parseInt(offset);

    return result;
};

const handleComplexSelect = (columns, from, where, groupBy, having, orderBy, limit, offset) => {
    const pipeline = [];

    if (where) {
        pipeline.push({ $match: parseCondition(where) });
    }

    if (groupBy) {
        const groupStage = { $group: { _id: {} } };
        groupBy.split(',').forEach(col => {
            col = col.trim();
            groupStage.$group._id[col] = `$${col}`;
        });

        columns.split(',').forEach(col => {
            col = col.trim();
            if (col.toLowerCase().includes(' as ')) {
                const [expr, alias] = col.split(/\s+as\s+/i);
                groupStage.$group[alias.trim()] = parseAggregateExpression(expr.trim());
            } else if (!groupBy.includes(col)) {
                groupStage.$group[col] = parseAggregateExpression(col);
            }
        });

        pipeline.push(groupStage);
    }

    if (having) {
        pipeline.push({ $match: parseCondition(having) });
    }

    if (orderBy) {
        pipeline.push({ $sort: parseOrderBy(orderBy) });
    }

    if (offset) {
        pipeline.push({ $skip: parseInt(offset) });
    }

    if (limit) {
        pipeline.push({ $limit: parseInt(limit) });
    }

    const projectStage = { $project: {} };
    columns.split(',').forEach(col => {
        col = col.trim();
        if (col.toLowerCase().includes(' as ')) {
            const [, alias] = col.split(/\s+as\s+/i);
            projectStage.$project[alias.trim()] = 1;
        } else if (groupBy) {
            projectStage.$project[col] = `$${col}`;
        } else {
            projectStage.$project[col] = 1;
        }
    });
    pipeline.push(projectStage);

    return {
        operation: "aggregate",
        collection: parseFrom(from),
        pipeline: pipeline
    };
};

const handleInsert = (query) => {
    const regex = /INSERT\s+INTO\s+(.*?)\s*(?:\((.*?)\))?\s*VALUES\s*(.*)/is;
    const match = query.match(regex);

    if (!match) {
        throw new Error("Invalid INSERT query");
    }

    const [, table, columns, valuesList] = match;

    const documents = parseInsertValues(columns, valuesList);

    return {
        operation: documents.length > 1 ? "insertMany" : "insertOne",
        collection: table.trim(),
        documents: documents
    };
};

const handleUpdate = (query) => {
    const regex = /UPDATE\s+(.*?)\s+SET\s+(.*?)\s+WHERE\s+(.*)/is;
    const match = query.match(regex);

    if (!match) {
        throw new Error("Invalid UPDATE query");
    }

    const [, table, set, where] = match;

    return {
        operation: "updateMany",
        collection: table.trim(),
        update: { $set: parseSetClause(set) },
        filter: parseCondition(where)
    };
};

const handleDelete = (query) => {
    const regex = /DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.*))?/is; // Capture the table name correctly
    const match = query.match(regex);

    if (!match) {
        throw new Error("Invalid DELETE query");
    }

    const [, table, where] = match;

    const result = {
        operation: "deleteMany",
        collection: table.trim(), // Ensure the table name is trimmed
    };

    if (where) result.filter = parseCondition(where.trim()); // Trim the condition as well

    return result;
};


const handleCreateTable = (sqlCreateTable) => {
    const tableNameMatch = sqlCreateTable.match(/CREATE TABLE (\w+)/i);
    const tableName = tableNameMatch ? tableNameMatch[1] : null;

    if (!tableName) {
        throw new Error("Invalid SQL: Unable to extract table name");
    }

    // Extract column definitions
    const columnRegex = /(\w+)\s+(\w+(?:\(\d+\))?)\s*([^,\n]+)?/g;
    const columns = [...sqlCreateTable.matchAll(columnRegex)];

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
};
/*
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
*/

const hasSubquery = (query) => {
    return /\(SELECT\s+.*?\)/i.test(query);
};

// Main conversion function
const sqlToJson = (sqlQuery) => {
    try {
        sqlQuery = sqlQuery.trim();
        const queryType = sqlQuery.split(/\s+/)[0].toUpperCase();

        const queryTypes = {
            SELECT: handleSelect,
            INSERT: handleInsert,
            UPDATE: handleUpdate,
            DELETE: handleDelete,
            CREATE: handleCreateTable
        };

        if (queryTypes[queryType]) {
            return queryTypes[queryType](sqlQuery);
        } else {
            return { error: "Unsupported query type" };
        }
    } catch (error) {
        return { error: `Conversion error: ${error.message}` };
    }
};

// Example usage
const queries = [
    `SELECT * FROM employees
WHERE department_id in (SELECT department_id FROM departments WHERE department_name = 'HR')`,
    `UPDATE users SET age = 31 , a = b WHERE name = 'John Doe' AND order_id IN (SELECT order_id FROM order_items WHERE product_id = 123 AND name IN ('Kavyaa', 'Lakshita', 'Cousin'))`,
    "SELECT product_name, AVG(quantity) as total_quantity FROM order_items GROUP BY product_name ORDER BY total_quantity DESC LIMIT 10 OFFSET 5",
    `SELECT first_name, last_name, salary FROM employees WHERE department = 'HR' and name in (SELECT name from heros)`,
    `CREATE TABLE users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT true,
        role ENUM('user', 'admin', 'moderator') DEFAULT 'user'
    )`,
    `DELETE from users where a = b`
];

queries.forEach(query => {
    const result = sqlToJson(query);
    console.log("SQL Query:", query);
    console.log("MongoDB-style JSON:", JSON.stringify(result, null, 2));
    console.log();
});

// Export the main conversion function
// module.exports = sqlToJson;