function pgsqlToJSON(sqlQuery){
    function parsePostgresToMongo(sqlQuery) {
    sqlQuery = sqlQuery.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    const queryRegex = /^(SELECT|INSERT|UPDATE|DELETE)\s+(.*)$/i;
    const selectRegex = /SELECT\s+(.+?)\s+FROM\s+(\w+(?:\s+\w+)?(?:\s+AS\s+\w+)?)\s*(.*)$/i;
    const insertRegex = /INSERT INTO\s+(\w+)\s+\((.+?)\)\s+VALUES\s+\((.+?)\)/i;
    const updateRegex = /UPDATE\s+(\w+)\s+SET\s+(.+?)(?:\s+WHERE\s+(.+))?$/i;
    const deleteRegex = /DELETE FROM\s+(\w+)(?:\s+WHERE\s+(.+))?$/i;

    const queryMatch = sqlQuery.match(queryRegex);
    if (!queryMatch) {
    console.error('Query type match failed');
    throw new Error('Invalid SQL query');
    }

    const queryType = queryMatch[1].toUpperCase();
    let mongoQuery = {};
    switch (queryType) {
    case 'SELECT':
        const selectMatch = sqlQuery.match(selectRegex);
        if (!selectMatch) {
        console.error('SELECT match failed');
        console.log('SELECT Regex:', selectRegex);
        throw new Error('Invalid SELECT query');
        }

        const [, selectFields, tableClause, restOfQuery] = selectMatch;
        let tableName, tableAlias;

        if (tableClause.includes(' AS ')) {
        [tableName, tableAlias] = tableClause.split(' AS ').map(s => s.trim());
        } else {
        [tableName, tableAlias] = tableClause.split(/\s+/).map(s => s.trim());
        }

        if (!tableAlias) {
        throw new Error('Table alias is required');
        }

        mongoQuery = {
        operation: 'aggregate',
        collection: tableName,
        alias: tableAlias,
        pipeline: []
        };

        // Parse the rest of the query
        const whereMatch = restOfQuery.match(/WHERE\s+(.+?)(?:\s+GROUP BY|\s+ORDER BY|\s+LIMIT|$)/i);
        const groupByMatch = restOfQuery.match(/GROUP BY\s+(.+?)(?:\s+HAVING|\s+ORDER BY|\s+LIMIT|$)/i);
        const havingMatch = restOfQuery.match(/HAVING\s+(.+?)(?:\s+ORDER BY|\s+LIMIT|$)/i);
        const orderByMatch = restOfQuery.match(/ORDER BY\s+(.+?)(?:\s+LIMIT|$)/i);
        const limitMatch = restOfQuery.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);

        // Handle SELECT fields
        const projectionStage = { $project: {} };
        selectFields.split(',').forEach(field => {
        const trimmedField = field.trim();
        if (trimmedField === '*') {
            // Keep all fields
            return;
        }
        if (trimmedField.toLowerCase().includes(' as ')) {
            const [expr, alias] = trimmedField.split(/\s+AS\s+/i).map(s => s.trim());
            projectionStage.$project[alias] = parseExpression(expr, tableAlias);
        } else if (trimmedField.includes('(')) {
            // Handle function calls
            const funcMatch = trimmedField.match(/(\w+)\((.*?)\)(?:\s+AS\s+(\w+))?/i);
            if (funcMatch) {
            const [, func, args, alias] = funcMatch;
            const parsedFunc = parseSQLFunction(func, args, tableAlias);
            projectionStage.$project[alias || func] = parsedFunc;
            }
        } else {
            projectionStage.$project[trimmedField.replace(new RegExp(`^${tableAlias}\\.`, 'i'), '')] = 1;
        }
        });
        mongoQuery.pipeline.push(projectionStage);

        // Handle WHERE clause
        if (whereMatch) {
        const matchStage = { $match: parseWhereClause(whereMatch[1], tableAlias) };
        mongoQuery.pipeline.push(matchStage);
        }

        // Handle GROUP BY clause
        if (groupByMatch) {
        const groupStage = parseGroupByClause(groupByMatch[1], tableAlias);
        mongoQuery.pipeline.push(groupStage);
        }

        // Handle HAVING clause
        if (havingMatch) {
        const havingStage = { $match: parseHavingClause(havingMatch[1], tableAlias) };
        mongoQuery.pipeline.push(havingStage);
        }

        // Handle ORDER BY clause
        if (orderByMatch) {
        const sortStage = { $sort: parseOrderByClause(orderByMatch[1], tableAlias) };
        mongoQuery.pipeline.push(sortStage);
        }

        // Handle LIMIT and OFFSET clauses
        if (limitMatch) {
        const limit = parseInt(limitMatch[1], 10);
        mongoQuery.pipeline.push({ $limit: limit });
        
        if (limitMatch[2]) {
            const offset = parseInt(limitMatch[2], 10);
            mongoQuery.pipeline.push({ $skip: offset });
        }
        }

        break;

    case 'INSERT':
        const insertMatch = sqlQuery.match(insertRegex);
        if (!insertMatch) {
        throw new Error('Invalid INSERT query');
        }

        const [, tableNameInsert, fieldsInsert, valuesInsert] = insertMatch;

        mongoQuery = {
        operation: 'insertOne',
        collection: tableNameInsert,
        document: {}
        };

        const fields = fieldsInsert.split(',').map(field => field.trim());
        const values = valuesInsert.split(',').map(value => value.trim());

        fields.forEach((field, index) => {
        mongoQuery.document[field] = parseValue(values[index]);
        });

        break;

    case 'UPDATE':
        const updateMatch = sqlQuery.match(updateRegex);
        if (!updateMatch) {
        throw new Error('Invalid UPDATE query');
        }

        const [, tableNameUpdate, updatesUpdate, whereClauseUpdate] = updateMatch;

        mongoQuery = {
        operation: 'updateMany',
        collection: tableNameUpdate,
        update: { $set: {} },
        filter: {}
        };

        updatesUpdate.split(',').forEach(update => {
        const [field, value] = update.split('=').map(s => s.trim());
        mongoQuery.update.$set[field] = parseValue(value);
        });

        if (whereClauseUpdate) {
        mongoQuery.filter = parseWhereClause(whereClauseUpdate);
        }

        break;

    case 'DELETE':
        const deleteMatch = sqlQuery.match(deleteRegex);
        if (!deleteMatch) {
        throw new Error('Invalid DELETE query');
        }

        const [, tableNameDelete, whereClauseDelete] = deleteMatch;

        mongoQuery = {
        operation: 'deleteMany',
        collection: tableNameDelete,
        filter: {}
        };

        if (whereClauseDelete) {
        mongoQuery.filter = parseWhereClause(whereClauseDelete);
        }

        break;

    default:
        throw new Error(`Unsupported query type: ${queryType}`);
    }

    return mongoQuery;
}

function parseWhereClause(whereClause, tableAlias) {
    const conditions = whereClause.split(/\s+AND\s+/i);
    const mongoConditions = {};

    conditions.forEach(condition => {
    let [field, operator, ...valueParts] = condition.split(/\s+/);
    field = field.replace(new RegExp(`^${tableAlias}\\.`, 'i'), '');
    const value = valueParts.join(' ').replace(/['"]/g, '').trim();

    switch (operator.toUpperCase()) {
        case '=':
        mongoConditions[field] = parseValue(value);
        break;
        case '>':
        mongoConditions[field] = { $gt: parseValue(value) };
        break;
        case '<':
        mongoConditions[field] = { $lt: parseValue(value) };
        break;
        case '>=':
        mongoConditions[field] = { $gte: parseValue(value) };
        break;
        case '<=':
        mongoConditions[field] = { $lte: parseValue(value) };
        break;
        case '!=':
        case '<>':
        mongoConditions[field] = { $ne: parseValue(value) };
        break;
        case 'LIKE':
        mongoConditions[field] = { $regex: value.replace(/%/g, '.*').replace(/_/g, '.') };
        break;
        case 'IN':
        mongoConditions[field] = { $in: value.split(',').map(v => parseValue(v.trim())) };
        break;
        case 'NOT IN':
        mongoConditions[field] = { $nin: value.split(',').map(v => parseValue(v.trim())) };
        break;
        case 'BETWEEN':
        const [min, max] = value.split(/\s+AND\s+/i).map(v => parseValue(v.trim()));
        mongoConditions[field] = { $gte: min, $lte: max };
        break;
        case 'IS':
        if (value.toUpperCase() === 'NULL') {
            mongoConditions[field] = { $eq: null };
        } else if (value.toUpperCase() === 'NOT NULL') {
            mongoConditions[field] = { $ne: null };
        }
        break;
        default:
        throw new Error(`Unsupported operator: ${operator}`);
    }
    });

    return mongoConditions;
}

function parseGroupByClause(groupByClause, tableAlias) {
    const fields = groupByClause.split(',').map(field => field.trim());
    const group = { _id: {} };

    fields.forEach(field => {
    const cleanField = field.replace(new RegExp (`^${tableAlias}\\.`, 'i'), '');
    group._id[cleanField] = `$${cleanField}`;
    });

    return { $group: group };
}

function parseHavingClause(havingClause, tableAlias) {
    // For simplicity, we'll treat HAVING similar to WHERE
    return parseWhereClause(havingClause, tableAlias);
}

function parseOrderByClause(orderByClause, tableAlias) {
    const orderFields = orderByClause.split(',').map(field => field.trim());
    const sort = {};

    orderFields.forEach(field => {
    let [fieldName, direction] = field.split(/\s+/);
    fieldName = fieldName.replace(new RegExp(`^${tableAlias}\\.`, 'i'), '');
    sort[fieldName] = direction && direction.toUpperCase() === 'DESC' ? -1 : 1;
    });

    return sort;
}

function parseValue(value) {
    if (value.toLowerCase() === 'null') return null;
    if (!isNaN(value)) return Number(value);
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (value.match(/^\d{4}-\d{2}-\d{2}$/)) return new Date(value);
    return value.replace(/^['"]|['"]$/g, '');
}

function parseExpression(expr, tableAlias) {
    expr = expr.replace(new RegExp(`${tableAlias}\\.`, 'gi'), '');
    if (expr.includes('||')) {
    const parts = expr.split('||').map(part => part.trim());
    return { $concat: parts.map(part => part.startsWith('$') ? part : `$${part}`) };
    }
    if (expr.includes('OVER')) {
    // Handle window functions (simplified)
    const [func, partition] = expr.split('OVER');
    return {
        $function: {
        body: func.trim(),
        args: [],
        lang: 'js'
        }
    };
    }
    return expr.startsWith('$') ? expr : `$${expr}`;
}

function parseSQLFunction(funcName, args, tableAlias) {
    args = args.split(',').map(arg => arg.trim().replace(new RegExp(`^${tableAlias}\\.`, 'i'), ''));
    switch (funcName.toLowerCase()) {
    case 'avg':
    case 'sum':
    case 'min':
    case 'max':
    case 'count':
        return { [`$${funcName.toLowerCase()}`]: `$${args[0]}` };
    case 'coalesce':
        return { $coalesce: args.map(arg => parseExpression(arg, tableAlias)) };
    case 'concat':
        return { $concat: args.map(arg => parseExpression(arg, tableAlias)) };
    case 'substring':
        return { $substr: [`$${args[0]}`, parseInt(args[1]) - 1, parseInt(args[2])] };
    case 'upper':
        return { $toUpper: `$${args[0]}` };
    case 'lower':
        return { $toLower: `$${args[0]}` };
    case 'round':
        return { $round: [`$${args[0]}`, parseInt(args[1] || 0)] };
    case 'date':
    case 'date_trunc':
        return { $dateToString: { format: '%Y-%m-%d', date: `$${args[0]}` } };
    default:
        throw new Error(`Unsupported function: ${funcName}`);
    }
} return parsePostgresToMongo(sqlQuery)
}

module.exports = pgsqlToJSON;