function sqlToJSON(sqlQuery) {
  const sqlToIntermediateJSON = (sql) => {
    const intermediate = {};
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    // Define regex patterns for different SQL clauses
    const patterns = {
      select: /^select\s+(.+?)\s+from/i,
      from: /\s+from\s+(\S+|\(.+?\)(?:\s+as\s+\S+)?)/i,
      where: /\s+where\s+(.+?)(?=\s+(?:group by|having|order by|limit|$))/i,
      groupBy: /\s+group by\s+(.+?)(?=\s+(?:having|order by|limit|$))/i,
      having: /\s+having\s+(.+?)(?=\s*(?:order\s+by|limit|offset|$))/i,
      orderBy: /\s+order by\s+(.+?)(?=\s+(?:limit|$))/i,
      limit: /\s+limit\s+(\d+)/i,
      offset: /\s+offset\s+(\d+)/i,
      insert: /^insert into\s+(\S+)\s*\((.+?)\)\s*values\s*(.+)$/i,
      update: /^update\s+(\S+)\s+set\s+(.+?)\s+where\s+(.+)$/i,
      delete: /^delete from\s+(\S+)(?:\s+where\s+(.+))?$/i,
      join: /\s+((?:inner|left|right|full|cross)\s+)?join\s+(\S+)\s+(?:as\s+(\S+))?\s*on\s+(.+?)(?=\s+(?:where|group by|having|order by|limit|$))/gi,
      union: /\s+union\s+(?:all\s+)?/i,
      subquery: /\((select\s+.+?)\)\s+(?:as\s+(\S+))?/gi
    };

    // Helper function to extract matches
    const extractMatch = (pattern) => {
      const match = normalizedSql.match(pattern);
      return match ? match[1] : null;
    };

    // Determine the operation type
    if (normalizedSql.toLowerCase().startsWith('select')) {
      intermediate.operation = 'find';
      if (normalizedSql.includes('group by') || /\b(count|sum|avg|min|max)\s*\(/i.test(normalizedSql)) {
        intermediate.operation = 'aggregate';
      }
    } else if (normalizedSql.toLowerCase().startsWith('insert')) {
      intermediate.operation = 'insert';
    } else if (normalizedSql.toLowerCase().startsWith('update')) {
      intermediate.operation = 'update';
    } else if (normalizedSql.toLowerCase().startsWith('delete')) {
      intermediate.operation = 'delete';
    }

    // Parse different clauses
    if (intermediate.operation === 'find' || intermediate.operation === 'aggregate') {
      intermediate.projection = parseProjection(extractMatch(patterns.select));
      
      const fromClause = extractMatch(patterns.from);
      if (fromClause) {
        if (fromClause.startsWith('(')) {
          intermediate.from = parseSubquery(fromClause);
        } else {
          intermediate.collection = fromClause;
        }
      }
      
      const whereClause = extractMatch(patterns.where);
      if (whereClause) {
        intermediate.filter = parseWhereClause(whereClause);
      }
      
      const groupByClause = extractMatch(patterns.groupBy);
      if (groupByClause) {
        intermediate.groupBy = groupByClause.split(',').map(field => field.trim());
      }
      
      const havingClause = extractMatch(patterns.having);
      if (havingClause) {
        intermediate.having = parseHavingClause(havingClause);
      }
      
      const orderByClause = extractMatch(patterns.orderBy);
      if (orderByClause) {
        intermediate.sort = parseOrderByClause(orderByClause);
      }
      
      const limitClause = extractMatch(patterns.limit);
      if (limitClause) {
        intermediate.limit = parseInt(limitClause, 10);
      }
      
      const offsetClause = extractMatch(patterns.offset);
      if (offsetClause) {
        intermediate.skip = parseInt(offsetClause, 10);
      }
      
      // Handle JOINs
      const joins = [];
      let joinMatch;
      while ((joinMatch = patterns.join.exec(normalizedSql)) !== null) {
        joins.push({
          type: joinMatch[1] ? joinMatch[1].trim() : 'inner',
          collection: joinMatch[2],
          alias: joinMatch[3] || null,
          on: parseJoinCondition(joinMatch[4])
        });
      }
      if (joins.length > 0) {
        intermediate.joins = joins;
      }
      
      // Handle UNIONs
      if (patterns.union.test(normalizedSql)) {
        intermediate.union = normalizedSql.split(patterns.union).map(query => sqlToIntermediateJSON(query.trim()));
      }
      
      // Handle subqueries
      const subqueries = [];
      let subqueryMatch;
      while ((subqueryMatch = patterns.subquery.exec(normalizedSql)) !== null) {
        subqueries.push({
          query: sqlToIntermediateJSON(subqueryMatch[1]),
          alias: subqueryMatch[2] || null
        });
      }
      if (subqueries.length > 0) {
        intermediate.subqueries = subqueries;
      }
    } else if (intermediate.operation === 'insert') {
      const insertMatch = normalizedSql.match(patterns.insert);
      if (insertMatch) {
        intermediate.collection = insertMatch[1];
        const fields = insertMatch[2].split(',').map(f => f.trim());
        const valuesList = insertMatch[3].split(/\),\s*\(/).map(v => v.replace(/[()]/g, '').split(',').map(item => item.trim().replace(/^'|'$/g, '')));
        intermediate.documents = valuesList.map(values => {
          return fields.reduce((acc, field, index) => {
            acc[field] = parseValue(values[index]);
            return acc;
          }, {});
        });
      }
    } else if (intermediate.operation === 'update') {
      const updateMatch = normalizedSql.match(patterns.update);
      if (updateMatch) {
        intermediate.collection = updateMatch[1];
        intermediate.update = parseUpdateClause(updateMatch[2]);
        intermediate.filter = parseWhereClause(updateMatch[3]);
      }
    } else if (intermediate.operation === 'delete') {
      const deleteMatch = normalizedSql.match(patterns.delete);
      if (deleteMatch) {
        intermediate.collection = deleteMatch[1];
        if (deleteMatch[2]) {
          intermediate.filter = parseWhereClause(deleteMatch[2]);
        }
      }
    }

    return intermediate;
  };

  const parseProjection = (projectionString) => {
    if (!projectionString || projectionString === '*') return {};
    return projectionString.split(',').reduce((acc, field) => {
      const [name, alias] = field.trim().split(/\s+as\s+/i);
      acc[alias || name] = 1;
      return acc;
    }, {});
  };

  const parseWhereClause = (whereClause) => {
    const tokens = tokenizeWhereClause(whereClause);
    return parseConditions(tokens);
  };

  const tokenizeWhereClause = (whereClause) => {
    const regex = /([()]|AND|OR|\bIN\b|\bLIKE\b|\bBETWEEN\b|!=|>=|<=|>|<|=|'[^']*'|\S+)/gi;
    return whereClause.match(regex) || [];
  };

  const parseConditions = (tokens, depth = 0) => {
    const result = {};
    let currentOperator = '$and';
    let currentCondition = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i].toUpperCase();

      if (token === '(') {
        const subCondition = parseConditions(tokens.slice(i + 1), depth + 1);
        const closingIndex = findClosingParenthesis(tokens, i);
        i = closingIndex;
        currentCondition.push(subCondition);
      } else if (token === ')') {
        if (depth > 0) break;
      } else if (token === 'AND' || token === 'OR') {
        if (currentCondition.length > 0) {
          result[currentOperator] = result[currentOperator] || [];
          result[currentOperator].push(
            currentCondition.length === 1 ? currentCondition[0] : { $and: currentCondition }
          );
          currentCondition = [];
        }
        currentOperator = token === 'AND' ? '$and' : '$or';
      } else {
        const condition = parseCondition(tokens.slice(i));
        i += condition.tokenCount - 1;
        currentCondition.push(condition);
      }
    }

    if (currentCondition.length > 0) {
      result[currentOperator] = result[currentOperator] || [];
      result[currentOperator].push(
        currentCondition.length === 1 ? currentCondition[0] : { $and: currentCondition }
      );
    }

    return result;
  };

  const parseCondition = (tokens) => {
    // Implement condition parsing logic here based on the first token
    // This is a placeholder to demonstrate the structure
    const field = tokens[0].replace(/['"]/g, '');
    const operator = tokens[1];
    const value = parseValue(tokens[2].replace(/['"]/g, ''));

    return { [field]: { [`$${operator}`]: value } };
  };

  const findClosingParenthesis = (tokens, start) => {
    let depth = 1;
    for (let i = start + 1; i < tokens.length; i++) {
      if (tokens[i] === '(') depth++;
      if (tokens[i] === ')') depth--;
      if (depth === 0) return i;
    }
    return -1; // Not found
  };

  const parseUpdateClause = (updateClause) => {
    const updates = {};
    const assignments = updateClause.split(',').map(assignment => assignment.trim());
    for (const assignment of assignments) {
      const [field, value] = assignment.split('=').map(item => item.trim());
      updates[field] = parseValue(value.replace(/^'|'$/g, ''));
    }
    return updates;
  };

  const parseOrderByClause = (orderByClause) => {
    return orderByClause.split(',').map(field => {
      const [name, order] = field.trim().split(/\s+/);
      return { [name]: order ? (order.toLowerCase() === 'desc' ? -1 : 1) : 1 };
    });
  };

  const parseJoinCondition = (onClause) => {
    // Implement join condition parsing logic here
    return onClause; // Placeholder, implement parsing logic
  };

  const parseValue = (value) => {
    if (!isNaN(value)) return parseFloat(value);
    if (value === 'true' || value === 'false') return value === 'true';
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value; // Return as string by default
  };

  const parseSubquery = (subquery) => {
    return sqlToIntermediateJSON(subquery);
  };

  return sqlToIntermediateJSON(sqlQuery);
}


// Export the function
module.exports = sqlToJSON;

// Test functionz
const testSQLToIntermediate = (sqlQuery) => {
  console.log('SQL:', sqlQuery);
  console.log('Intermediate JSON:', sqlToJSON(sqlQuery));
  console.log('---');
};

// Test cases
const testCases = [
  `SELECT name, fine FROM hello WHERE job = 'active' AND name = 'Kavyaa'`,
  `SELECT name, age FROM employees WHERE department = 'IT' AND salary > 50000 ORDER BY age DESC LIMIT 10`,
  `INSERT INTO products (name, price, category) VALUES ('New Product', 19.99, 'Electronics')`,
  `UPDATE customers SET last_visit = '2023-04-15' WHERE id = 1234`,
  `DELETE FROM orders WHERE order_date < '2023-01-01'`,
  `SELECT e.name, d.department_name 
   FROM employees e 
   INNER JOIN departments d ON e.department_id = d.id 
   WHERE e.salary > 60000`,
  `SELECT department, AVG(salary) as avg_salary 
   FROM employees 
   GROUP BY department 
   HAVING AVG(salary) > 55000`,
  `SELECT * FROM (SELECT name, age FROM employees WHERE age > 30) AS senior_employees`,
  `SELECT * FROM users 
   UNION 
   SELECT * FROM archived_users`,
];

// Run test cases
testCases.forEach(testSQLToIntermediate);