const parseMongoQuery = require('./mongoToJSON');
// Utility functions
const operatorMap = {
  $eq: '=',
  $ne: '!=',
  $gt: '>',
  $gte: '>=',
  $lt: '<',
  $lte: '<=',
  $in: 'IN',
  $nin: 'NOT IN',
  $and: 'AND',
  $or: 'OR',
  $not: 'NOT',
  $exists: null, // Special handling
  $regex: 'LIKE',
  $type: null, // Special handling
  $all: null, // Special handling
  $elemMatch: null, // Special handling
  $size: null // Special handling
};

function escapeValue(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
  if (Array.isArray(value)) return `(${value.map(escapeValue).join(', ')})`;
  return value;
}
function safeParseStage(stage) {
  if (typeof stage === 'string') {
    try {
      return JSON.parse(stage);
    } catch (e) {
      return stage;
    }
  }
  return stage;
}


// Function to parse a single condition
function parseCondition(field, condition) {
  if (condition === null) {
    return [{
      field,
      operator: 'IS',
      value: null
    }];
  }

  if (typeof condition !== 'object' || condition instanceof RegExp) {
    return [{
      field,
      operator: '$eq',
      value: condition
    }];
  }

  const result = [];
  Object.entries(condition).forEach(([operator, value]) => {
    if (operator.startsWith('$')) {
      result.push({
        field,
        operator,
        value
      });
    } else {
      // Handle nested objects
      result.push(...parseCondition(`${field}.${operator}`, value));
    }
  });
  return result;
}

// Function to convert MongoDB query to intermediate representation
function convertQueryToIntermediate(query) {
  if (!query || Object.keys(query).length === 0) {
    return { conditions: [] };
  }

  function recursiveParse(obj) {
    if (!obj) return [];
    
    if (Array.isArray(obj)) {
      return obj.flatMap(recursiveParse);
    }
    
    if (typeof obj !== 'object') {
      return [{ operator: '$eq', value: obj }];
    }
    
    const conditions = [];
    Object.entries(obj).forEach(([key, value]) => {
      if (key.startsWith('$')) {
        conditions.push({
          operator: key,
          conditions: Array.isArray(value) ? value.map(recursiveParse).flat() : recursiveParse(value)
        });
      } else {
        conditions.push(...parseCondition(key, value));
      }
    });
    return conditions;
  }

  return { conditions: recursiveParse(query) };
}

// Function to convert intermediate representation to SQL
function convertIntermediateToSQL(intermediate) {
  function handleSpecialOperators(condition) {
    switch (condition.operator) {
      case '$exists':
        return `${condition.field} IS ${condition.value ? 'NOT NULL' : 'NULL'}`;
      case '$type':
        // Simplified type checking - expand based on your SQL dialect
        return `typeof(${condition.field}) = ${escapeValue(condition.value)}`;
      case '$regex':
        let pattern = condition.value;
        if (pattern instanceof RegExp) {
          pattern = pattern.source;
        }
        return `${condition.field} LIKE ${escapeValue(pattern.replace(/%/g, '\\%').replace(/_/g, '\\_'))}`;
      case '$all':
        // This is a simplification - might need adjustment based on your SQL dialect
        return `${condition.field} @> ${escapeValue(condition.value)}`;
      case '$size':
        return `json_array_length(${condition.field}) = ${condition.value}`;
      default:
        return null;
    }
  }

  function conditionToSQL(condition) {
    if (!condition) return '1=1';

    if (condition.operator === '$and' || condition.operator === '$or') {
      const subConditions = condition.conditions
        .map(conditionToSQL)
        .filter(Boolean);
      
      if (subConditions.length === 0) return '1=1';
      if (subConditions.length === 1) return subConditions[0];
      
      return `(${subConditions.join(` ${operatorMap[condition.operator]} `)})`;
    }

    const specialHandling = handleSpecialOperators(condition);
    if (specialHandling) return specialHandling;

    const sqlOperator = operatorMap[condition.operator] || condition.operator;
    return `${condition.field} ${sqlOperator} ${escapeValue(condition.value)}`;
  }

  return intermediate.conditions.map(conditionToSQL).filter(Boolean).join(' AND ');
}

// Function to handle projections
function handleProjection(projection) {
  if (!projection || Object.keys(projection).length === 0) return '*';

  const includedFields = [];
  const excludedFields = [];

  Object.entries(projection).forEach(([field, value]) => {
    if (value === 1) {
      includedFields.push(field);
    } else if (value === 0) {
      excludedFields.push(field);
    }
  });

  if (includedFields.length > 0) return includedFields.join(', ');
  if (excludedFields.length > 0) {
    // This is a simplification - actual implementation would depend on your SQL dialect
    return `* EXCEPT (${excludedFields.join(', ')})`;
  }

  return '*';
}

// Main function to convert MongoDB find to SQL
function convertFindToSQL(query, options = {}) {
  const intermediate = convertQueryToIntermediate(query);
  const sqlConditions = convertIntermediateToSQL(intermediate);
  const selectClause = handleProjection(options.projection);
  
  let sqlQuery = `SELECT ${selectClause} FROM ${options.collection || 'table_name'}`;
  
  if (sqlConditions !== '1=1') {
    sqlQuery += ` WHERE ${sqlConditions}`;
  }

  if (options.sort) {
    const sortConditions = Object.entries(options.sort)
      .map(([field, direction]) => `${field} ${direction === 1 ? 'ASC' : 'DESC'}`);
    if (sortConditions.length > 0) {
      sqlQuery += ` ORDER BY ${sortConditions.join(', ')}`;
    }
  }

  if (options.limit) sqlQuery += ` LIMIT ${options.limit}`;
  if (options.skip) sqlQuery += ` OFFSET ${options.skip}`;

  return sqlQuery + ';';
}
//Insert Command
function convertInsertToSQL(doc, options = {}) {
  const columns = Object.keys(doc).join(', ');
  const values = Object.values(doc)
    .map((value) => (typeof value === 'string' ? `'${value}'` : value))
    .join(', ');

  const tableName = options.collection || 'table_name';

  let sqlQuery = `INSERT INTO ${tableName} (${columns}) VALUES (${values});`;

  return sqlQuery;
}

// Aggregate pipeline converter
function convertAggregateToSQL(pipeline, options = {}) {
  let sqlQuery = '';
  let currentTable = options.collection || 'table_name';
  
  try {
    pipeline.forEach((stage, index) => {
      const subQuery = `t${index}`;
      
      if (stage.$match) {
        let matchCondition = stage.$match;
        // Handle case where $match might be [Object]
        if (matchCondition === '[Object]' || typeof matchCondition !== 'object') {
          console.warn(`Warning: Invalid $match condition at stage ${index}. Using default condition.`);
          matchCondition = {};
        }
        
        const matchQuery = convertFindToSQL(matchCondition, { collection: currentTable });
        sqlQuery = sqlQuery ? `WITH ${subQuery} AS (${sqlQuery}) ${matchQuery}` : matchQuery;
      }
      
      if (stage.$group) {
        let groupCondition = stage.$group;
        // Handle case where $group might be [Object]
        if (groupCondition === '[Object]' || typeof groupCondition !== 'object') {
          console.warn(`Warning: Invalid $group condition at stage ${index}. Using default grouping.`);
          groupCondition = { _id: null };
        }
        
        const groupParts = [];
        const selectParts = [];
        
        if (groupCondition._id) {
          if (typeof groupCondition._id === 'string') {
            const cleanField = groupCondition._id.replace('$', '');
            groupParts.push(cleanField);
            selectParts.push(`${cleanField} AS _id`);
          } else if (typeof groupCondition._id === 'object' && groupCondition._id !== null) {
            Object.entries(groupCondition._id).forEach(([alias, field]) => {
              if (typeof field === 'string') {
                const cleanField = field.replace('$', '');
                groupParts.push(cleanField);
                selectParts.push(`${cleanField} AS ${alias}`);
              }
            });
          }
        }
        
        Object.entries(groupCondition).forEach(([key, value]) => {
          if (key === '_id') return;
          
          if (typeof value === 'object' && value !== null) {
            const [operator, field] = Object.entries(value)[0];
            if (typeof field === 'string') {
              const cleanField = field.replace('$', '');
              
              switch (operator) {
                case '$sum':
                  selectParts.push(`SUM(${cleanField}) AS ${key}`);
                  break;
                case '$avg':
                  selectParts.push(`AVG(${cleanField}) AS ${key}`);
                  break;
                case '$min':
                  selectParts.push(`MIN(${cleanField}) AS ${key}`);
                  break;
                case '$max':
                  selectParts.push(`MAX(${cleanField}) AS ${key}`);
                  break;
                case '$count':
                  selectParts.push(`COUNT(${cleanField}) AS ${key}`);
                  break;
              }
            }
          }
        });
        
        if (selectParts.length === 0) {
          selectParts.push('COUNT(*) as count');
        }
        
        const groupQuery = `SELECT ${selectParts.join(', ')} FROM ${
          sqlQuery ? `(${sqlQuery}) AS ${subQuery}` : currentTable
        }${groupParts.length ? ` GROUP BY ${groupParts.join(', ')}` : ''}`;
        
        sqlQuery = groupQuery;
      }
    });
    
    // Handle sort after the pipeline
    if (options.sort) {
      const sortParts = Object.entries(options.sort)
        .map(([field, direction]) => `${field} ${direction === 1 ? 'ASC' : 'DESC'}`);
      if (sortParts.length > 0) {
        sqlQuery += ` ORDER BY ${sortParts.join(', ')}`;
      }
    }
    
    return sqlQuery + ';';
  } catch (error) {
    throw new Error(`Error in aggregate pipeline conversion: ${error.message}`);
  }
}


// Main function to handle MongoDB commands
function handleMongoDBCommand(command) {
  const { collection, operation, query, projection, sort, limit, skip } = command;

  try {
    switch (operation) {
      case 'find':
        return convertFindToSQL(query, { collection, projection, sort, limit, skip });
      case 'insert':
        return convertInsertToSQL(query, {collection, projection, sort, limit, skip});
      case 'aggregate':
        if (!Array.isArray(query)) {
          throw new Error('Aggregate pipeline must be an array');
        }
        return convertAggregateToSQL(query, { collection, sort, limit, skip });
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  } catch (error) {
    console.error(`Error processing command: ${error.message}`);
    throw error;
  }
}

// Test cases
function runTests() {
  let tests = [`db.users.find({ name: { $eq: "John" }, age: { $gt: 25 } }, { name: 1, age: 1 }).limit(10).sort({ age: -1 })`,
    `db.users.insert({ name: "John Doe",
    age: 30,
    email: "johndoe@example.com",
    address: {
      street: "123 Main St",
      city: "Anytown",
      state: "CA",
      zip: "12345"
    },
    interests: ["music", "sports", "travel"]
  });`, `db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }]).limit(5).sort({ total: -1 })`];

  tests.forEach(test => {
    try {
      let intermediateQuery = parseMongoQuery(test);
      console.log(intermediateQuery)
      const result = handleMongoDBCommand(intermediateQuery);
      console.log("SQL Query:", result);
    } catch (error) {
      console.error("Error:", error.message);
    }
  });
}

// Run the tests
runTests();