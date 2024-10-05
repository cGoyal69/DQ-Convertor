function sqlToIntermediateJSON(sql) {
  const intermediate = {};

  const selectRegex = /SELECT (.+?) FROM/i;
  const fromRegex = /FROM (\S+)/i;
  const whereRegex = /WHERE (.+?)(GROUP BY|ORDER BY|LIMIT|$)/i;
  const groupByRegex = /GROUP BY (.+?)(ORDER BY|LIMIT|$)/i;
  const orderByRegex = /ORDER BY (.+?)(LIMIT|$)/i;
  const limitRegex = /LIMIT (\d+)/i;
  const offsetRegex = /OFFSET (\d+)/i;
  const insertRegex = /INSERT INTO (\S+) \((.+)\) VALUES \((.+)\)/i;
  const insertManyRegex = /INSERT INTO (\S+) \((.+)\) VALUES (.+)/i;
  const updateRegex = /UPDATE (\S+) SET (.+) WHERE (.+)/i;
  const deleteRegex = /DELETE FROM (\S+) WHERE (.+)/i;
  const joinRegex = /(INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+(\S+)\s+ON\s+(.+?)(WHERE|GROUP BY|ORDER BY|LIMIT|$)/gi;
  const havingRegex = /HAVING (.+?)(ORDER BY|LIMIT|$)/i;

  // Check for INSERT (Single and Many)
  const insertMatch = sql.match(insertRegex);
  const insertManyMatch = sql.match(insertManyRegex);

  if (insertManyMatch) {
    intermediate.operation = 'insertMany';
    intermediate.collection = insertManyMatch[1].trim();
    const fields = insertManyMatch[2].split(',').map(f => f.trim());
    const valuesGroup = insertManyMatch[3].split(/\),\s*\(/).map(group => group.replace(/[()]/g, ''));
    intermediate.insertMany = valuesGroup.map(group => {
      const values = group.split(',').map(v => v.trim().replace(/'/g, ''));
      return fields.reduce((acc, field, idx) => {
        acc[field] = values[idx];
        return acc;
      }, {});
    });
    return intermediate;
  }

  if (insertMatch) {
    intermediate.operation = 'insertOne';
    intermediate.collection = insertMatch[1].trim();
    const fields = insertMatch[2].split(',').map(f => f.trim());
    const values = insertMatch[3].split(',').map(v => v.trim().replace(/'/g, ''));
    intermediate.insertOne = fields.reduce((acc, field, idx) => {
      acc[field] = values[idx];
      return acc;
    }, {});
    return intermediate;
  }

  // Check for UPDATE
  const updateMatch = sql.match(updateRegex);
  if (updateMatch) {
    intermediate.operation = 'updateMany'; // Modify as needed
    intermediate.collection = updateMatch[1].trim();
    intermediate.update = parseUpdateClause(updateMatch[2]);
    intermediate.filter = parseWhereClause(updateMatch[3]);
    return intermediate;
  }

  // Check for DELETE
  const deleteMatch = sql.match(deleteRegex);
  if (deleteMatch) {
    intermediate.operation = deleteMatch[2].includes('=') ? 'deleteOne' : 'deleteMany';
    intermediate.collection = deleteMatch[1].trim();
    intermediate.filter = parseWhereClause(deleteMatch[2]);
    return intermediate;
  }

  // Default to SELECT (Find or Aggregate)
  const selectMatch = sql.match(selectRegex);
  if (selectMatch) {
    // Normalize SQL to lower case for case-insensitive matching
    const normalizedSql = sql.toLowerCase();
  
    // Check for aggregate functions and common aggregation patterns
    const aggregateFunctions = /count|sum|avg|min|max|stddev|variance|json_agg|array_agg|group_concat/i;
    const isAggregate = normalizedSql.includes('group by') || 
                        normalizedSql.includes('having') || 
                        aggregateFunctions.test(selectMatch[1]);
  
    intermediate.operation = isAggregate ? 'aggregate' : 'find';
    intermediate.projection = selectMatch[1].split(',').map(field => field.trim());
  }


  // Parse FROM clause
  const fromMatch = sql.match(fromRegex);
  if (fromMatch) {
    intermediate.collection = fromMatch[1].trim();
  }

  // Parse HAVING clause
  const havingMatch = sql.match(havingRegex);
  if (havingMatch) {
    intermediate.having = parseHavingClause(havingMatch[1].trim());
  }

  // Parse JOINs
  let joinMatch;
  intermediate.joins = [];
  while ((joinMatch = joinRegex.exec(sql)) !== null) {
    const join = parseJoinClause(joinMatch[0].trim());
    if (join) {
      intermediate.joins.push(join);
    }
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

  // Parse LIMIT clause
  const limitMatch = sql.match(limitRegex);
  if (limitMatch) {
    intermediate.limit = parseInt(limitMatch[1], 10);
  }

  // Parse OFFSET clause
  const offsetMatch = sql.match(offsetRegex);
  if (offsetMatch) {
    intermediate.offset = parseInt(offsetMatch[1], 10);
  }

  return intermediate;
}


// Helper functions
function parseOrderByClause(orderByClause) {
  const orderFields = orderByClause.split(',').map(field => {
    const [fieldName, order] = field.trim().split(/\s+/);
    return {
      field: fieldName,
      order: order ? order.toLowerCase() : 'asc' // default to 'asc' if no order specified
    };
  });

  return orderFields;
}

// Function to parse WHERE clause
function parseWhereClause(whereClause) {
  const conditions = [];

  const conditionRegex = /(\w+)\s*(=|!=|>|<|>=|<=|IN|LIKE|NOT IN|IS NOT NULL|IS NULL)\s*('?[\w\s%]+'?)/g;
  let match;

  // Handle OR conditions first
  const orConditions = whereClause.split(/ OR /i).map(part => part.trim());

  orConditions.forEach(orPart => {
    const andConditions = orPart.split(/ AND /i).map(part => part.trim());
    const andGroup = [];

    andConditions.forEach(condition => {
      while ((match = conditionRegex.exec(condition)) !== null) {
        andGroup.push({
          field: match[1],
          operator: match[2],
          value: match[3].replace(/'/g, '')
        });
      }
    });

    if (andGroup.length > 0) {
      conditions.push(andGroup);
    }
  });

  return { or: conditions };
}

// Function to parse UPDATE clause
function parseUpdateClause(updateClause) {
  const updates = {};

  const conditionParts = updateClause.split(/,\s*/);

  conditionParts.forEach(part => {
    const [field, value] = part.split('=');

    if (field && value) {
      updates[field.trim()] = value.trim().replace(/'/g, '');
    }
  });

  return updates;
}

// Function to parse HAVING clause
function parseHavingClause(havingClause) {
  const conditions = [];
  const conditionRegex = /(\w+)\s*(=|!=|>|<|>=|<=|IN|LIKE|NOT IN|IS NOT NULL|IS NULL)\s*('?[\w\s%]+'?)/g;
  let match;

  // Split the HAVING clause into separate conditions
  while ((match = conditionRegex.exec(havingClause)) !== null) {
    conditions.push({
      field: match[1],
      operator: match[2],
      value: match[3].replace(/'/g, '')
    });
  }

  return { $and: conditions }; // Using $and to group conditions
}

// Function to parse JOIN clause
function parseJoinClause(joinClause) {
  const joinMatch = joinClause.match(/(INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+(\S+)\s+ON\s+(.+)/i);
  if (joinMatch) {
    const joinType = joinMatch[1] ? joinMatch[1].trim().toLowerCase() : 'inner';
    const joinCollection = joinMatch[2].trim();
    const joinCondition = joinMatch[3].trim();

    const conditionRegex = /(\w+)\s*(=|!=|>|<|>=|<=)\s*'?([\w\s%]+)'?/g;
    let match;
    const conditions = [];

    while ((match = conditionRegex.exec(joinCondition)) !== null) {
      conditions.push({
        field: match[1],
        operator: match[2],
        value: match[3].replace(/'/g, '')
      });
    }

    return {
      type: joinType,
      collection: joinCollection,
      on: conditions
    };
  }
  return null;
}

// Function to convert Intermediate JSON to MongoDB query

  // Handle find operation (SELECT)
  function intermediateToMongo(intermediate) {
    let mongoQuery = {};
  
    // Handle find operation (SELECT)
    if (intermediate.operation === 'find') {
      mongoQuery = `db.${intermediate.collection}.find(`;
  
      // Match filtering conditions (WHERE clause)
      if (intermediate.filter) {
        const filter = generateFilter(intermediate.filter);
        mongoQuery += filter ? `${JSON.stringify(filter)}, ` : '';
      }
  
      // Match projection (SELECT fields)
      if (intermediate.projection) {
        const projection = {};
        intermediate.projection.forEach(field => {
          const fieldName = field.split(' AS ')[0].trim();
          projection[fieldName] = 1; // Set to 1 for projection
        });
        mongoQuery += `${JSON.stringify(projection)}`;
      } else {
        mongoQuery += '{}'; // return all fields if no projection
      }
  
      mongoQuery += ')';
  
      // Add sorting conditions (ORDER BY clause)
      if (intermediate.orderBy) {
        const sortFields = intermediate.orderBy.map(order => {
          return `${order.field}: ${order.order === 'desc' ? -1 : 1}`;
        });
        mongoQuery += `.sort({ ${sortFields.join(', ')} })`;
      }
  
      // Add limit (LIMIT clause)
      if (intermediate.limit) {
        mongoQuery += `.limit(${intermediate.limit})`;
      }
  
      // Add offset (OFFSET clause)
      if (intermediate.offset) {
        mongoQuery += `.skip(${intermediate.offset})`;
      }
    }
  
    // Handle aggregate operation
    if (intermediate.operation === 'aggregate') {
      mongoQuery = `db.${intermediate.collection}.aggregate([`;
  
      // Match filtering conditions (WHERE clause)
      if (intermediate.filter) {
        const filter = generateFilter(intermediate.filter);
        mongoQuery += `{ $match: ${JSON.stringify(filter)} }, `;
      }
  
      // Add group by (GROUP BY clause)
      if (intermediate.groupBy) {
        const groupStage = {
          $group: intermediate.groupBy.reduce((acc, field) => {
            acc[field] = { $first: `$${field}` }; // Modify this based on your aggregation logic
            return acc;
          }, { _id: null })
        };
        mongoQuery += JSON.stringify(groupStage) + ', ';
      }
  
      // Add having (HAVING clause)
      if (intermediate.having) {
        const havingConditions = generateFilter(intermediate.having.$and);
        mongoQuery += `{ $match: ${JSON.stringify(havingConditions)} }, `;
      }
  
      // Add project stage (SELECT fields)
      if (intermediate.projection) {
        const projectStage = {
          $project: intermediate.projection.reduce((acc, field) => {
            acc[field.split(' AS ')[0].trim()] = 1; // Set to 1 for projection
            return acc;
          }, {})
        };
        mongoQuery += JSON.stringify(projectStage);
      } else {
        mongoQuery += '{}'; // return all fields if no projection
      }
  
      mongoQuery += '])';
    }
  

  // Handle insert operation
  if (intermediate.operation === 'insertOne') {
    mongoQuery = `db.${intermediate.collection}.insertOne(${JSON.stringify(intermediate.insertOne)})`;
  }

  if (intermediate.operation === 'insertMany') {
    mongoQuery = `db.${intermediate.collection}.insertMany(${JSON.stringify(intermediate.insertMany)})`;
  }

  // Handle update operation
  if (intermediate.operation === 'updateMany') {
    mongoQuery = `db.${intermediate.collection}.updateMany(`;

    // Match filtering conditions
    if (intermediate.filter) {
      const filter = generateFilter(intermediate.filter);
      mongoQuery += `${JSON.stringify(filter)}, `;
    }

    // Match update conditions
    if (intermediate.update) {
      mongoQuery += `${JSON.stringify(intermediate.update)}`;
    }
    mongoQuery += ')';
  }

  // Handle delete operation
  if (intermediate.operation === 'deleteMany') {
    mongoQuery = `db.${intermediate.collection}.deleteMany(${JSON.stringify(intermediate.filter)})`;
  }

  if (intermediate.operation === 'deleteOne') {
    mongoQuery = `db.${intermediate.collection}.deleteOne(${JSON.stringify(intermediate.filter)})`;
  }

  return mongoQuery;
}

// Helper function to generate filter from conditions
function generateFilter(conditions) {
  const orConditions = [];

  conditions.or.forEach(andConditions => {
    const andGroup = {};
    andConditions.forEach(cond => {
      const { field, operator, value } = cond;
      switch (operator) {
        case '=':
          andGroup[field] = value; // Equality condition
          break;
        case '!=':
          andGroup[field] = { $ne: value }; // Not equal condition
          break;
        case '>':
          andGroup[field] = { $gt: value }; // Greater than condition
          break;
        case '<':
          andGroup[field] = { $lt: value }; // Less than condition
          break;
        case '>=':
          andGroup[field] = { $gte: value }; // Greater than or equal condition
          break;
        case '<=':
          andGroup[field] = { $lte: value }; // Less than or equal condition
          break;
        case 'IN':
          andGroup[field] = { $in: value.split(',').map(v => v.trim()) }; // IN condition
          break;
        case 'LIKE':
          andGroup[field] = { $regex: value.replace(/%/g, '.*') }; // LIKE condition (converted to regex)
          break;
        case 'NOT IN':
          andGroup[field] = { $nin: value.split(',').map(v => v.trim()) }; // NOT IN condition
          break;
        case 'IS NOT NULL':
          andGroup[field] = { $ne: null }; // IS NOT NULL condition
          break;
        case 'IS NULL':
          andGroup[field] = null; // IS NULL condition
          break;
        default:
          break;
      }
    });
    orConditions.push(andGroup);
  });

  return orConditions.length > 0 ? { $or: orConditions } : {};
}

let sqlQuery = `select user from apply where a = b`;
function toSingleLine(str) {
    return str.replace(/\s+/g, ' ').trim();
}
function removeEscapeCharacters(query) {
  return query.replace(/\\n/g, ' ').replace(/\\/g, '');
}

sqlQuery = toSingleLine(sqlQuery)
const intermediateJson = sqlToIntermediateJSON(sqlQuery);
console.log(intermediateJson);

let mongoquery = intermediateToMongo(intermediateJson);
a = (JSON.stringify(mongoquery, null, 2));
b = toSingleLine(a)
console.log(removeEscapeCharacters(b))
