// Function to parse a single condition and segregate field, operator, and value
function parseCondition(field, condition) {
  const result = [];
  if (typeof condition === 'object' && !Array.isArray(condition)) {
    // Handle conditions like { "$gte": 18 }
    Object.keys(condition).forEach(operator => {
      result.push({
        field: field,
        operator: operator,
        value: condition[operator]
      });
    });
  } else {
    // Handle conditions like { age: 18 }
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
      // Handle arrays for $and and $or operators
      return obj.flatMap(condition => recursiveParse(condition));
    } else if (typeof obj === 'object' && obj !== null) {
      // Handle objects and operators like $and and $or
      const conditions = [];
      
      Object.keys(obj).forEach(key => {
        if (key.startsWith('$')) {
          // Handle logical operators like $and, $or
          conditions.push({
            operator: key,
            conditions: recursiveParse(obj[key])
          });
        } else {
          // Handle specific conditions with field, operator, and value
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
function convertIntermediateToSQL(intermediate, options = {}) {
  function operatorToSQL(operator) {
    switch (operator) {
      // Comparison Operators
      case '$eq': return '=';
      case '$ne': return '!=';
      case '$gt': return '>';
      case '$gte': return '>=';
      case '$lt': return '<';
      case '$lte': return '<=';
      case '$in': return 'IN';
      
      // Logical Operators
      case '$and': return 'AND';
      case '$or': return 'OR';
      case '$not': return 'NOT';
      case '$nor': return 'NOT (A OR B)'; // $nor translates to NOT (A OR B) in SQL
      
      // Element Operators
      case '$exists': return 'IS NOT NULL'; // Checks if a field exists
      
      // Evaluation Operators
      case '$regex': return 'LIKE'; // For pattern matching
      
      default: return operator; // Return the operator as-is if no match
    }
  }

  function valueToSQL(value) {
    if (Array.isArray(value)) {
      return `(${value.map(v => typeof v === 'string' ? `'${v}'` : v).join(', ')})`;
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

  const sqlConditions = conditionsToSQL(intermediate.conditions);
  
  let sqlFindQuery = `SELECT * FROM ${options.table || 'table_name'} WHERE ${sqlConditions.join(' AND ')}`;

  if (options.projection && options.projection.length > 0) {
    sqlFindQuery = `SELECT ${options.projection.join(', ')} FROM ${options.table || 'table_name'} WHERE ${sqlConditions.join(' AND ')}`;
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

// Convert MongoDB insert command to SQL insert statement
function convertInsertToSQL(documents, options = {}) {
  if (!Array.isArray(documents)) {
    documents = [documents]; // Handle single document insertion
  }

  const columns = Object.keys(documents[0]);
  const values = documents.map(doc =>
    `(${columns.map(col => (typeof doc[col] === 'string' ? `'${doc[col]}'` : doc[col])).join(', ')})`
  );

  const sqlInsert = `INSERT INTO ${options.table || 'table_name'} (${columns.join(', ')}) VALUES ${values.join(', ')};`;

  return sqlInsert;
}

function createSQLTable(documents, options = {}) {
  const tableName = options.table || 'table_name';
  
  // Dynamically determine column data types based on the MongoDB document schema
  const columns = Object.keys(documents[0]).map(key => {
    const value = documents[0][key];
    let dataType;

    if (typeof value === 'string') {
      dataType = 'VARCHAR(255)';
    } else if (typeof value === 'number') {
      dataType = Number.isInteger(value) ? 'INT' : 'FLOAT';
    } else if (Array.isArray(value)) {
      dataType = 'TEXT'; // For storing arrays as a string (e.g., JSON)
    } else if (typeof value === 'boolean') {
      dataType = 'BOOLEAN';
    } else {
      dataType = 'TEXT'; // Default to TEXT for complex or undefined types
    }

    return `${key} ${dataType}`;
  });

  const sqlCreateTable = `CREATE TABLE ${tableName} (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  ${columns.join(',\n  ')}\n);`;

  return sqlCreateTable;
}
//String to Object
// Replace keys without quotes and then single quotes with double quotes
function stringToObject(str) {
  // Replace keys without quotes and then single quotes with double quotes
  const validJsonString = str
      .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Wrap keys in double quotes
      .replace(/'/g, '"'); // Replace single quotes with double quotes

  try {
      const jsonObject = JSON.parse(validJsonString);
      return jsonObject;
  } catch (error) {
      console.error("Error parsing JSON:", error);
      return null;
  }
}
function convertUpdateToSQL(update, conditions, options = {}) {
  const updates = [];
  
  Object.keys(update).forEach(operator => {
    switch (operator) {
      // Handle $set operator
      case '$set':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${typeof update[operator][field] === 'string' ? `'${update[operator][field]}'` : update[operator][field]}`);
        });
        break;

      // Handle $unset operator
      case '$unset':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = NULL`);
        });
        break;

      // Handle $inc operator
      case '$inc':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${field} + ${update[operator][field]}`);
        });
        break;

      // Handle $mul operator
      case '$mul':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = ${field} * ${update[operator][field]}`);
        });
        break;

      // Handle $rename operator
      case '$rename':
        Object.keys(update[operator]).forEach(oldField => {
          const newField = update[operator][oldField];
          // Simulate renaming by creating a new column and dropping the old one
          updates.push(`${newField} = ${oldField}`);
          updates.push(`${oldField} = NULL`);
        });
        break;

      // Handle $min operator
      case '$min':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = LEAST(${field}, ${update[operator][field]})`);
        });
        break;

      // Handle $max operator
      case '$max':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = GREATEST(${field}, ${update[operator][field]})`);
        });
        break;

      // Handle $currentDate operator
      case '$currentDate':
        Object.keys(update[operator]).forEach(field => {
          if (update[operator][field] === true || update[operator][field].$type === 'date') {
            updates.push(`${field} = NOW()`);
          } else if (update[operator][field].$type === 'timestamp') {
            updates.push(`${field} = CURRENT_TIMESTAMP`);
          }
        });
        break;

      // Handle $push operator (assumes array fields in SQL as JSON or TEXT)
      case '$push':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = JSON_ARRAY_APPEND(${field}, '$', ${JSON.stringify(update[operator][field])})`);
        });
        break;

      // Handle $pop operator (removes first or last element from array, not easily translatable to SQL without advanced JSON functions)
      case '$pop':
        Object.keys(update[operator]).forEach(field => {
          if (update[operator][field] === 1) {
            // Pop last element
            updates.push(`${field} = JSON_REMOVE(${field}, JSON_LENGTH(${field}) - 1)`);
          } else if (update[operator][field] === -1) {
            // Pop first element
            updates.push(`${field} = JSON_REMOVE(${field}, 0)`);
          }
        });
        break;

      // Handle $pull operator (remove all instances of a value from array)
      case '$pull':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = JSON_REMOVE(${field}, '${update[operator][field]}')`);
        });
        break;

      // Handle $addToSet operator (only adds to the array if the value does not already exist, assumes array is stored as JSON or TEXT)
      case '$addToSet':
        Object.keys(update[operator]).forEach(field => {
          updates.push(`${field} = JSON_ARRAY_APPEND(${field}, '$', ${JSON.stringify(update[operator][field])})`);
        });
        break;

      // Handle $bit operator (bitwise update)
      case '$bit':
        Object.keys(update[operator]).forEach(field => {
          const bitUpdate = update[operator][field];
          Object.keys(bitUpdate).forEach(bitOp => {
            if (bitOp === 'and') {
              updates.push(`${field} = ${field} & ${bitUpdate[bitOp]}`);
            } else if (bitOp === 'or') {
              updates.push(`${field} = ${field} | ${bitUpdate[bitOp]}`);
            } else if (bitOp === 'xor') {
              updates.push(`${field} = ${field} ^ ${bitUpdate[bitOp]}`);
            }
          });
        });
        break;

      default:
        console.error(`Unknown operator: ${operator}`);
    }
  });

  const sqlUpdate = `UPDATE ${options.table || 'table_name'} SET ${updates.join(', ')} WHERE ${conditions.join(' AND ')};`;
  return sqlUpdate;
}

// Example usage of convertUpdateToSQL:

const updateQuery = {
  $set: { age: 35, city: "New York" },
  $inc: { score: 5 },
  $min: { age: 30 },
  $max: { score: 100 },
  $rename: { oldField: "newField" }
};


// Sample MongoDB insertMany example
const scomd = '[{name:"Alice",age:24,city:"Los Angeles",hobbies:["hiking","music"]},{name:"Bob",age:32,city:"Chicago",hobbies:["sports","photography"]},{name:"Charlie",age:28,city:"Houston",hobbies:["gaming","cooking"]}]';
const mongoQuery = stringToObject(scomd);
console.log(mongoQuery)

// Query options for MySQL
const queryOptions = {
  operation: 'find',
  table: 'employees',
  projection: ['name', 'age'],
  sort: { age: 1, name: -1 },  // age ASC, name DESC
  limit: 10,
  skip: 5
};

// Convert MongoDB query to intermediate representation
const intermediateRepresentation = convertQueryToIntermediate(mongoQuery);
console.log("Intermediate Representation:", JSON.stringify(intermediateRepresentation, null, 2));

// Convert intermediate representation to SQL query
const sqlFindQuery = convertIntermediateToSQL(intermediateRepresentation, queryOptions);
console.log("Generated SQL Query:", sqlFindQuery);

// Convert MongoDB insert command to SQL insert statement
const sqlInsertQuery = convertInsertToSQL(mongoQuery,queryOptions );
console.log("Generated SQL Insert Query:", sqlInsertQuery);

const createTableSQL = createSQLTable(mongoQuery, queryOptions);
console.log("Generated SQL Create Table Query:\n", createTableSQL);