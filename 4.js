// Function to parse a single condition and segregate field, operator, and value
function parseCondition(field, condition) {
  const result = [];
  if (typeof condition === 'object' && condition !== null && !Array.isArray(condition)) {
    Object.keys(condition).forEach(operator => {
      result.push({
        field: field,
        operator: operator,
        value: condition[operator]
      });
    });
  } else {
    result.push({
      field: field,
      operator: '=',
      value: condition
    });
  }
  return result;
}

// Function to convert MongoDB query into an intermediate representation with segregation
function convertQueryToIntermediate(query) {
  const intermediate = { conditions: [] };

  function recursiveParse(obj) {
    if (Array.isArray(obj)) {
      return obj.flatMap(condition => recursiveParse(condition));
    } else if (typeof obj === 'object' && obj !== null) {
      const conditions = [];
      Object.keys(obj).forEach(key => {
        if (key.startsWith('$')) {
          conditions.push({
            operator: key,
            conditions: recursiveParse(obj[key])
          });
        } else {
          conditions.push(...parseCondition(key, obj[key]));
        }
      });
      return conditions;
    }
  }

  intermediate.conditions.push(...recursiveParse(query));
  return intermediate;
}

// Function to convert intermediate representation to SQL query
function convertIntermediateToSQL(intermediate) {
  function operatorToSQL(operator) {
    const operatorMap = {
      '$eq': '=',
      '$ne': '!=',
      '$gt': '>',
      '$gte': '>=',
      '$lt': '<',
      '$lte': '<=',
      '$in': 'IN',
      '$nin': 'NOT IN',
      '$and': 'AND',
      '$or': 'OR',
      '$exists': 'IS NOT NULL',
      '$regex': 'LIKE',
    };
    return operatorMap[operator] || operator;
  }

  function valueToSQL(value) {
    if (Array.isArray(value)) {
      return `(${value.map(v => (typeof v === 'string' ? `'${v}'` : v)).join(', ')})`;
    }
    return typeof value === 'string' ? `'${value}'` : value;
  }

  function conditionsToSQL(conditions) {
    return conditions.map(condition => {
      if (condition.operator === '$and' || condition.operator === '$or') {
        return `(${conditionsToSQL(condition.conditions).join(` ${operatorToSQL(condition.operator)} `)})`;
      } else {
        return `${condition.field} ${operatorToSQL(condition.operator)} ${valueToSQL(condition.value)}`;
      }
    });
  }

  return conditionsToSQL(intermediate.conditions).join(' AND ');
}

// Function to convert MongoDB find command to SQL query
function convertFindToSQL(intermediate, options = {}) {
  const sqlConditions = convertIntermediateToSQL(intermediate);
  let sqlFindQuery = `SELECT * FROM ${options.table || 'table_name'} WHERE ${sqlConditions}`;

  if (options.projection && options.projection.length > 0) {
    sqlFindQuery = `SELECT ${options.projection.join(', ')} FROM ${options.table || 'table_name'} WHERE ${sqlConditions}`;
  }

  if (options.sort) {
    const sortConditions = Object.keys(options.sort).map(field => `${field} ${options.sort[field] > 0 ? 'ASC' : 'DESC'}`);
    sqlFindQuery += ` ORDER BY ${sortConditions.join(', ')}`;
  }

  if (options.limit) {
    sqlFindQuery += ` LIMIT ${options.limit}`;
  }

  if (options.skip) {
    sqlFindQuery += ` OFFSET ${options.skip}`;
  }

  return sqlFindQuery + ';';
}

// Function to convert MongoDB insert command to SQL insert statement
function flattenObject(obj, prefix = '') {
  const flattened = {};
  for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
              Object.assign(flattened, flattenObject(obj[key], newKey));
          } else {
              flattened[newKey] = obj[key];
          }
      }
  }
  return flattened;
}

function convertInsertToSQL(documents, options = {}) {
  if (!Array.isArray(documents)) {
      documents = [documents];
  }
  
  // Flatten documents
  const flattenedDocs = documents.map(flattenObject);
  const columns = Object.keys(flattenedDocs[0]);
  const values = flattenedDocs.map(doc =>
      `(${columns.map(col => (typeof doc[col] === 'string' ? `'${doc[col]}'` : doc[col])).join(', ')})`
  );

  return `INSERT INTO ${options.table || 'table_name'} (${columns.join(', ')}) VALUES ${values.join(', ')};`;
}

// Function to create SQL table based on MongoDB document structure
function createSQLTable(documents, options = {}) {
  const tableName = options.table || 'table_name';
  const columns = Object.keys(documents[0]).map(key => {
    const value = documents[0][key];
    let dataType;

    if (typeof value === 'string') {
      dataType = 'VARCHAR(255)';
    } else if (typeof value === 'number') {
      dataType = Number.isInteger(value) ? 'INT' : 'FLOAT';
    } else if (Array.isArray(value)) {
      dataType = 'TEXT';
    } else if (typeof value === 'boolean') {
      dataType = 'BOOLEAN';
    } else {
      dataType = 'TEXT';
    }

    return `${key} ${dataType}`;
  });

  return `CREATE TABLE ${tableName} (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  ${columns.join(',\n  ')}\n);`;
}

// Function to convert update command to SQL update statement
function convertUpdateToSQL(update, conditions, options = {}) {
  const updates = [];

  Object.keys(update).forEach(operator => {
    switch (operator) {
      case '$set':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${typeof update[operator][field] === 'string' ? `'${update[operator][field]}'` : update[operator][field]}`);
        });
        break;
      case '$unset':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = NULL`);
        });
        break;
      case '$inc':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${field} + ${update[operator][field]}`);
        });
        break;
      case '$mul':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${field} * ${update[operator][field]}`);
        });
        break;
      case '$rename':
        Object.keys(update[operator]).forEach(oldField => {
          const newField = update[operator][oldField];
          updates.push(`${newField} = ${oldField}`);
          updates.push(`${oldField} = NULL`);
        });
        break;
      case '$min':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = LEAST(${field}, ${update[operator][field]})`);
        });
        break;
      case '$max':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = GREATEST(${field}, ${update[operator][field]})`);
        });
        break;
      case '$currentDate':
        Object.keys(update[operator]).forEach(field => {
          if (update[operator][field] === true || update[operator][field].$type === 'date') {
            updates.push(`${field} = NOW()`);
          } else if (update[operator][field].$type === 'timestamp') {
            updates.push(`${field} = CURRENT_TIMESTAMP`);
          }
        });
        break;
      default:
        break;
    }
  });

  const sqlConditions = convertIntermediateToSQL(conditions);
  return `UPDATE ${options.table || 'table_name'} SET ${updates.join(', ')} WHERE ${sqlConditions};`;
}

// Function to convert MongoDB aggregate command to SQL
function convertAggregateToSQL(aggregation, options = {}) {
  const sqlSelectParts = [];
  const sqlFrom = `FROM ${options.table || 'table_name'}`;
  let sqlGroupBy = '';
  let sqlOrderBy = '';
  let sqlLimit = '';

  aggregation.forEach(stage => {
    if (stage.$match) {
      const intermediateMatch = convertQueryToIntermediate(stage.$match);
      const matchSQL = convertIntermediateToSQL(intermediateMatch);
      sqlSelectParts.push(matchSQL); // Shouldn't prefix with WHERE here
    }
    
    if (stage.$group) {
      const groupFields = Object.keys(stage.$group);
      sqlGroupBy = `GROUP BY ${groupFields.join(', ')}`;
      const aggregations = Object.keys(stage.$group).map(field => {
        const aggFunc = stage.$group[field].$sum ? 'SUM' : 'COUNT'; // Add more aggregations as needed
        return `${aggFunc}(${field}) AS ${field}`;
      });
      sqlSelectParts.push(aggregations.join(', '));
    }
    
    if (stage.$sort) {
      const sortConditions = Object.keys(stage.$sort).map(field => `${field} ${stage.$sort[field] > 0 ? 'ASC' : 'DESC'}`);
      sqlOrderBy = `ORDER BY ${sortConditions.join(', ')}`;
    }

    if (stage.$limit) {
      sqlLimit = `LIMIT ${stage.$limit}`;
    }
  });

  const sqlSelect = `SELECT ${sqlSelectParts.join(', ')} ${sqlFrom} ${sqlGroupBy} ${sqlOrderBy} ${sqlLimit};`;
  return sqlSelect;
}

// Main function to handle MongoDB commands and convert them to SQL
function handleMongoDBCommand(command) {
  const { collection, operation, query, options } = command;

  switch (operation) {
    case 'find':
      const intermediateFind = convertQueryToIntermediate(query);
      return convertFindToSQL(intermediateFind, options);
    case 'insert':
      return convertInsertToSQL(query, options);
    case 'create':
      return createSQLTable(query, options);
    case 'update':
      return convertUpdateToSQL(query.update, query.conditions, options);
    case 'aggregate':
      return convertAggregateToSQL(query, options);
    default:
      throw new Error('Unsupported operation');
  }
}

// Example usage:
const command = {
  collection: 'orders',
  operation: 'aggregate',
  query: [ { '$match': [Object] }, { '$group': [Object] } ],
  sort: { total: -1 }
};

console.log(handleMongoDBCommand(command));
