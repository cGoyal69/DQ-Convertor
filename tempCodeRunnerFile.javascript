// Main function to convert SQL to Intermediate JSON
function sqlToIntermediateJSON(sql) {
    const intermediate = {};
    
    const selectRegex = /SELECT (.+?) FROM/i;
    const fromRegex = /FROM (\S+)/i;
    const whereRegex = /WHERE (.+?)(GROUP BY|ORDER BY|LIMIT|$)/i;
    const groupByRegex = /GROUP BY (.+?)(ORDER BY|LIMIT|$)/i;
    const orderByRegex = /ORDER BY (.+?)(LIMIT|$)/i;
    const limitRegex = /LIMIT (\d+)/i;
    const offsetRegex = /OFFSET (\d+)/i;
    const joinRegex = /JOIN (\s+) ON (.+?)(WHERE|GROUP BY|ORDER BY|LIMIT|$)/i;

    // Default to SELECT (Find)
    intermediate.operation = 'find';
    
    // Parse SELECT clause
    const selectMatch = sql.match(selectRegex);
    if (selectMatch) {
        
        intermediate.projection = selectMatch[1].split(',').map(field => field.trim());
    }

    // Parse FROM clause
    const fromMatch = sql.match(fromRegex);
    if (fromMatch) {
        intermediate.collection = fromMatch[1].trim();
    }

    // Parse JOINs
    let joinMatch = joinRegex.exec(sql);
    console.log(joinMatch)
    intermediate.joins = [];
    while ((joinMatch = joinRegex.exec(sql)) !== null) {
        console.log("Hll")
        const joinType = joinMatch[1] ? joinMatch[1].trim().toLowerCase() : 'inner';
        intermediate.joins.push({
            type: joinType,
            collection: joinMatch[2].trim(),
            on: parseJoinClause(joinMatch[3].trim())
        });
    }

    // Parse WHERE clause
    const whereMatch = sql.match(whereRegex);
    if (whereMatch) {
        intermediate.filter = parseWhereClause(whereMatch[1].trim());
    }

    // Parse GROUP BY clause
    const groupByMatch = sql.match(groupByRegex);
    if (groupByMatch) {
        intermediate.groupBy = groupByMatch[1].split(',').map(field => field.trim());
    }

    // Parse ORDER BY clause
    const orderByMatch = sql.match(orderByRegex);
    if (orderByMatch) {
        intermediate.orderBy = parseOrderByClause(orderByMatch[1].trim());
    }

    return intermediate;
}

// Function to parse WHERE clause
function parseWhereClause(whereClause) {
    const conditions = [];

    // Regular expression to handle conditions (OR and AND)
    const conditionRegex = /(\w+)\s*(=|!=|>|<|>=|<=|IN|LIKE|NOT IN|IS NOT NULL|IS NULL)\s*('?[\w\s%]+'?)/g;
    let match;

    // Handle OR conditions first
    const orConditions = whereClause.split(/ OR /i).map(part => part.trim());

    orConditions.forEach(orPart => {
        const andConditions = orPart.split(/ AND /i).map(part => part.trim());
        const andGroup = [];

        // Process each AND condition
        andConditions.forEach(condition => {
            while ((match = conditionRegex.exec(condition)) !== null) {
                andGroup.push({
                    field: match[1],
                    operator: match[2],
                    value: match[3].replace(/'/g, '') // Remove quotes around values
                });
            }
        });

        if (andGroup.length > 0) {
            conditions.push(andGroup);
        }
    });

    // Return as { or: [ [and conditions], ...] }
    return { or: conditions };
}

// Function to parse JOIN clause
function parseJoinClause(joinClause) {
    const conditions = [];
    const conditionRegex = /(\w+)\s*(=|!=|>|<|>=|<=)\s*('?[\w\s%]+'?)/g;
    let match;
    while ((match = conditionRegex.exec(joinClause)) !== null) {
        conditions.push({
            field: match[1],
            operator: match[2],
            value: match[3].replace(/'/g, '') // Remove quotes around values
        });
    }
    return { and: conditions };
}

// Function to parse ORDER BY clause
function parseOrderByClause(orderByClause) {
    return orderByClause.split(',').map(field => {
        const parts = field.trim().split(' ');
        return { field: parts[0], order: parts[1] ? parts[1].toUpperCase() : 'ASC' };
    });
}

// Function to convert Intermediate JSON to MongoDB query
function intermediateToMongo(intermediate) {
    let mongoQuery = {};

    // Handle find operation (SELECT)
    if (intermediate.operation === 'find') {
        const projection = intermediate.projection.reduce((acc, field) => {
            acc[field] = 1; // Include field in projection
            return acc;
        }, {});
        
        mongoQuery = {
            collection: intermediate.collection,
            filter: intermediate.filter ? conditionsToMongo(intermediate.filter.or) : {},
            projection: projection
        };

        // Handle joins (assuming it's for aggregation)
        if (intermediate.joins.length > 0) {
            mongoQuery.joins = intermediate.joins.map(join => ({
                collection: join.collection,
                on: conditionsToMongo(join.on.and)
            }));
        }

        // Handle GROUP BY and ORDER BY
        if (intermediate.groupBy) {
            mongoQuery.groupBy = intermediate.groupBy;
        }

        if (intermediate.orderBy) {
            mongoQuery.sort = intermediate.orderBy.reduce((acc, field) => {
                acc[field.field] = field.order === 'ASC' ? 1 : -1;
                return acc;
            }, {});
        }
    }

    return mongoQuery;
}

// Helper function to convert conditions to MongoDB
function conditionsToMongo(conditions) {
    if (!conditions || conditions.length === 0) return {};

    return {
        $or: conditions.map(andConditions => {
            if (andConditions.length === 1) {
                return mapConditionToMongo(andConditions[0]);
            }
            return {
                $and: andConditions.map(condition => mapConditionToMongo(condition))
            };
        })
    };
}

// Helper function to map individual SQL condition to MongoDB format
function mapConditionToMongo(condition) {
    const mongoOperators = {
        '=': '$eq',
        '!=': '$ne',
        '>': '$gt',
        '<': '$lt',
        '>=': '$gte',
        '<=': '$lte',
        'IN': '$in',
        'NOT IN': '$nin',
        'LIKE': '$regex',  // MongoDB supports regex for LIKE patterns
        'IS NULL': null,   // Handle NULL conditions
        'IS NOT NULL': { $ne: null }
    };

    const operator = mongoOperators[condition.operator];

    // Handle IS NULL and IS NOT NULL cases
    if (condition.operator === 'IS NULL') {
        return { [condition.field]: null };
    }

    if (condition.operator === 'IS NOT NULL') {
        return { [condition.field]: { $ne: null } };
    }

    // For other operators
    return { [condition.field]: { [operator]: condition.value } };
}

// Example: Test SQL queries
let sqlQuery = `SELECT 
    oi.product_name,
    SUM(oi.quantity) AS total_quantity_sold
FROM 
    orders o
JOIN 
    order_items oi ON o.order_id = oi.order_id
WHERE 
    o.order_date >= '2023-09-01' 
    AND o.order_date < '2023-10-01'
GROUP BY 
    oi.product_name
ORDER BY 
    total_quantity_sold DESC;`;

function toSingleLine(str) {
    return str.replace(/\s+/g, ' ').trim();
}
sqlQuery = toSingleLine(sqlQuery)
const intermediateJson = sqlToIntermediateJSON(sqlQuery);
console.log(intermediateJson);

const mongoQuery = intermediateToMongo(intermediateJson);
console.log(JSON.stringify(mongoQuery, null, 2));