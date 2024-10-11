function sqlToJSON(sqlQuery){
  const sqlToIntermediateJSON = (sql) => {
    const intermediate = {};
    const normalizedSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();

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
    if (normalizedSql.startsWith('select')) {
      intermediate.operation = 'find';
      if (normalizedSql.includes('group by') || /\b(count|sum|avg|min|max)\s*\(/i.test(normalizedSql)) {
        intermediate.operation = 'aggregate';
      }
    } else if (normalizedSql.startsWith('insert')) {
      intermediate.operation = 'insert';
    } else if (normalizedSql.startsWith('update')) {
      intermediate.operation = 'update';
    } else if (normalizedSql.startsWith('delete')) {
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
            acc[field] = values[index];
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
        currentCondition.push(condition.parsed);
      }
    }

    if (currentCondition.length > 0) {
      result[currentOperator] = result[currentOperator] || [];
      result[currentOperator].push(
        currentCondition.length === 1 ? currentCondition[0] : { $and: currentCondition }
      );
    }

    return Object.keys(result).length === 1 && result[currentOperator].length === 1
      ? result[currentOperator][0]
      : result;
  };

  const parseCondition = (tokens) => {
    const field = tokens[0];
    const operator = tokens[1].toUpperCase();
    let value, tokenCount;

    switch (operator) {
      case 'LIKE':
        value = { $regex: tokens[2].replace(/^'|'$/g, '').replace(/%/g, '.*') };
        tokenCount = 3;
        break;
      case 'IN':
        value = { $in: parseInClause(tokens.slice(2)) };
        tokenCount = value.$in.length + 3; // field, IN, (, values, )
        break;
      case 'BETWEEN':
        const [min, , max] = tokens.slice(2, 5);
        value = { $gte: parseValue(min), $lte: parseValue(max) };
        tokenCount = 5;
        break;
      default:
        value = { [operatorMap[operator]]: parseValue(tokens[2]) };
        tokenCount = 3;
    }

    return { parsed: { [field]: value }, tokenCount };
  };

  const operatorMap = {
    '=': '$eq',
    '!=': '$ne',
    '>': '$gt',
    '>=': '$gte',
    '<': '$lt',
    '<=': '$lte'
  };

  const parseInClause = (tokens) => {
    const values = [];
    let i = 1; // Skip the opening parenthesis
    while (tokens[i] !== ')') {
      if (tokens[i] !== ',') {
        values.push(parseValue(tokens[i]));
      }
      i++;
    }
    return values;
  };

  const parseValue = (value) => {
    if (value.toLowerCase() === 'null') return null;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (!isNaN(value)) return Number(value);
    return value.replace(/^'|'$/g, '');
  };

  const findClosingParenthesis = (tokens, start) => {
    let count = 1;
    for (let i = start + 1; i < tokens.length; i++) {
      if (tokens[i] === '(') count++;
      if (tokens[i] === ')') count--;
      if (count === 0) return i;
    }
    return tokens.length - 1;
  };

  const parseHavingClause = (havingClause) => {
    // First, we'll identify and handle aggregate functions
    const aggregateFunctionPattern = /(count|sum|avg|min|max)\s*\(([^)]+)\)/gi;
    let processedClause = havingClause;
    const aggregateFunctions = {};
    let match;

    while ((match = aggregateFunctionPattern.exec(havingClause)) !== null) {
      const fullMatch = match[0];
      const funcName = match[1].toLowerCase();
      const argument = match[2].trim();
      
      // Create a placeholder that we'll use in parsing
      const placeholder = `__${funcName}_${argument.replace(/[^\w]/g, '_')}__`;
      aggregateFunctions[placeholder] = {
        $function: funcName,
        argument: argument === '*' ? null : argument
      };
      
      processedClause = processedClause.replace(fullMatch, placeholder);
    }

    // Now parse the processed clause like a normal WHERE clause
    let parsedClause = parseWhereClause(processedClause);

    // Replace the placeholders with the actual aggregate function objects
    const replaceAggregates = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map(replaceAggregates);
      }
      
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          newObj[key] = replaceAggregates(value);
        } else if (typeof value === 'string' && aggregateFunctions[value]) {
          newObj[key] = aggregateFunctions[value];
        } else if (aggregateFunctions[key]) {
          newObj[aggregateFunctions[key].$function] = {
            $field: aggregateFunctions[key].argument,
            ...value
          };
        } else {
          newObj[key] = value;
        }
      }
      return newObj;
    };

    return replaceAggregates(parsedClause);
  };

  const parseOrderByClause = (orderByClause) => {
    return orderByClause.split(',').reduce((acc, item) => {
      const [field, direction] = item.trim().split(/\s+/);
      acc[field] = direction && direction.toLowerCase() === 'desc' ? -1 : 1;
      return acc;
    }, {});
  };

  const parseUpdateClause = (updateClause) => {
    return updateClause.split(',').reduce((acc, item) => {
      const [field, value] = item.trim().split('=');
      acc[field.trim()] = parseValue(value.trim());
      return acc;
    }, {});
  };

  const parseJoinCondition = (condition) => {
    const [leftField, rightField] = condition.split('=').map(f => f.trim());
    return { [leftField]: rightField };
  };

  const parseSubquery = (subqueryString) => {
    const match = subqueryString.match(/\((select\s+.+?)\)\s+(?:as\s+(\S+))?/i);
    if (match) {
      return {
        query: sqlToIntermediateJSON(match[1]),
        alias: match[2] || null
      };
    }
    return null;
  };
  return JSON.stringify(sqlToIntermediateJSON(sqlQuery), null, 2)
}
module.exports = sqlToJSON;
/*
// Test function
const testSQLToIntermediate = (sqlQuery) => {
  console.log('SQL:', sqlQuery);
  console.log('Intermediate JSON:', sqlToJSON(sqlQuery));
  console.log('---');
};

// Test cases
const testCases = [
  "SELECT * FROM users WHERE name LIKE '%John%' AND (age BETWEEN 20 AND 30 OR city IN ('New York', 'Los Angeles'))",
  "SELECT name, age FROM users WHERE (status = 'active' AND age > 25) OR (status = 'pending' AND registration_date > '2023-01-01')",
  "SELECT * FROM products WHERE category IN ('Electronics', 'Books') AND price BETWEEN 10 AND 100 AND stock > 0",
  "SELECT * FROM orders WHERE (total > 1000 AND status != 'cancelled') OR (total <= 1000 AND status = 'shipped')",
  "SELECT u.name, o.total FROM users u INNER JOIN orders o ON u.id = o.user_id WHERE o.total > 100 GROUP BY u.id HAVING COUNT(o.id) > 5",
  "SELECT * FROM (SELECT name, COUNT(*) as order_count FROM users JOIN orders ON users.id = orders.user_id GROUP BY users.id) AS user_orders WHERE order_count > 10",
  "SELECT name, age FROM users UNION SELECT name, age FROM employees",
  "INSERT INTO users (name, age, city) VALUES ('John', 30, 'New York'), ('Alice', 25, 'Los Angeles')",
  "UPDATE users SET age = 31, last_login = '2023-05-01' WHERE id = 1",
  "DELETE FROM users WHERE last_login < '2022-01-01'",
  `SELECT department, COUNT(employee_id) AS employee_count
FROM employees
GROUP BY department
HAVING COUNT(employee_id) > 5;`
];

testCases.forEach(testSQLToIntermediate);
*/