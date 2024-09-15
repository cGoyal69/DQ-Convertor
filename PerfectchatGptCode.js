//const fs = require('fs');

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
      case '$mod': return 'MOD'; // Modulo operation
      case '$text': return 'MATCH'; // Full-text search (SQL full-text search needs custom implementation)
      case '$where': return 'CUSTOM CONDITION'; // Custom conditions, no direct SQL equivalent
      
      // Array Operators
      case '$all': return 'ALL'; // Can be simulated with multiple `IN` clauses
      case '$elemMatch': return 'EXISTS (SELECT 1 ...)'; // Implement with subqueries or joins
      case '$size': return 'COUNT'; // Checks array length
      
      // Update Operators
      case '$inc': return '+='; // Increment operation
      case '$set': return 'UPDATE SET'; // Updates field values
      case '$unset': return 'UPDATE SET column = NULL'; // Removes fields
      case '$push': return 'APPEND'; // No direct SQL equivalent (SQL databases do not support arrays)
      case '$pop': return 'REMOVE FIRST/LAST'; // No direct SQL equivalent (SQL databases do not support arrays)
      case '$pull': return 'REMOVE'; // No direct SQL equivalent (SQL databases do not support arrays)
      case '$addToSet': return 'INSERT DISTINCT'; // No direct SQL equivalent (SQL databases do not support arrays)
      
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
  
  let sqlQuery = `SELECT * FROM ${options.table || 'table_name'} WHERE ${sqlConditions.join(' AND ')}`;

  // Handling projection (SELECT specific fields)
  if (options.projection && options.projection.length > 0) {
    sqlQuery = `SELECT ${options.projection.join(', ')} FROM ${options.table || 'table_name'} WHERE ${sqlConditions.join(' AND ')}`;
  }

  // Handling sorting
  if (options.sort) {
    const sortConditions = Object.keys(options.sort).map(field => `${field} ${options.sort[field] > 0 ? 'ASC' : 'DESC'}`);
    sqlQuery += ` ORDER BY ${sortConditions.join(', ')}`;
  }

  // Handling limit
  if (options.limit) {
    sqlQuery += ` LIMIT ${options.limit}`;
  }

  // Handling offset (skip)
  if (options.skip) {
    sqlQuery += ` OFFSET ${options.skip}`;
  }

  return sqlQuery + ';';
}

//String to Object
function stringToObject(str) {
    try {
        let obj = JSON.parse(str);
        return obj;
    } catch (error) {
        console.error("Invalid JSON string:", error);
        return null;
    }
}
let scomd = '{"$and":[{"age" : {"$lt" : 21, "$gt": 18}}, {"name": "Kavyaa"}]}'
// Example MongoDB Query
const mongoQuery = stringToObject(scomd)
console.log(mongoQuery)
// Example projection, sorting, and limiting options (equivalent to MongoDB's find(), sort(), and limit())for mysql purpose only
const queryOptions = {
  table: 'employees',
  projection: ['name', 'age', 'gender'],
  sort: { age: 1, name: -1 },  // age ASC, name DESC
  limit: 10,
  skip: 5
};

// Convert MongoDB query to intermediate representation with segregation
const intermediateRepresentation = convertQueryToIntermediate(mongoQuery);
console.log("Intermediate Representation:", JSON.stringify(intermediateRepresentation, null, 2));

// Convert intermediate representation to SQL query with additional options
const sqlQuery = convertIntermediateToSQL(intermediateRepresentation, queryOptions);
console.log("Generated SQL Query:", sqlQuery);
