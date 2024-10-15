const sqlToJson = (sqlQuery) => {
  sqlQuery = sqlQuery.trim().toLowerCase();
  let result = {};

  if (sqlQuery.startsWith('insert')) {
    return JSON.stringify(parseInsert(sqlQuery));
  } else if (sqlQuery.startsWith('select')) {
    return JSON.stringify(parseSelect(sqlQuery));
  } else if (sqlQuery.startsWith('update')) {
    return JSON.stringify(parseUpdate(sqlQuery));
  } else if (sqlQuery.startsWith('delete')) {
    return JSON.stringify(parseDelete(sqlQuery));
  } else if (sqlQuery.startsWith('create table')) {
    return JSON.stringify(parseCreateTable(sqlQuery));
  } else if (sqlQuery.startsWith('alter table')) {
    return JSON.stringify(parseAlterTable(sqlQuery));
  } else if (sqlQuery.startsWith('drop table')) {
    return JSON.stringify(parseDropTable(sqlQuery));
  }

  throw new Error('Unsupported SQL operation');
};

const parseInsert = (sqlQuery) => {
  const result = { operation: 'insert' };
  const match = sqlQuery.match(/insert\s+into\s+(\w+)\s*\((.*?)\)\s*values\s*((?:\((.*?)\),?\s*)+)/is);

  if (match) {
    result.collection = match[1];
    const columns = match[2].split(',').map(col => col.trim());
    const valueSets = match[3].match(/\((.*?)\)/g).map(val => parseValueSet(val));

    result.documents = valueSets.map(values => 
      Object.fromEntries(columns.map((col, i) => [col, values[i]]))
    );
  }

  return result;
};

const parseValueSet = (valueSet) => {
  return valueSet.replace(/^\(|\)$/g, '').split(',').map(val => parseValue(val.trim()));
};

const parseSelect = (sqlQuery) => {
  const isAggregate = /\b(sum|avg|min|max|count)\s*\(/i.test(sqlQuery);
  
  if (isAggregate || /\bgroup\s+by\b/i.test(sqlQuery)) {
    return parseAggregateQuery(sqlQuery);
  }

  const result = { operation: 'find' };
  const match = sqlQuery.match(/select\s+(.*?)\s+from\s+(\w+)(?:\s+where\s+(.*?))?(?:\s+group\s+by\s+(.*?))?(?:\s+having\s+(.*?))?(?:\s+order\s+by\s+(.*?))?(?:\s+limit\s+(\d+))?(?:\s+offset\s+(\d+))?$/is);

  if (match) {
    result.collection = match[2];
    result.projection = match[1] === '*' ? {} : parseProjection(match[1]);
    
    if (match[3]) {
      result.filter = parseWhereClause(match[3]);
    }
    
    if (match[6]) {
      result.sort = parseOrderBy(match[6]);
    }
    
    if (match[7]) {
      result.limit = parseInt(match[7]);
    }
    
    if (match[8]) {
      result.skip = parseInt(match[8]);
    }
  }

  return result;
};

const parseAggregateQuery = (sqlQuery) => {
  const result = { operation: 'aggregate', pipeline: [] };
  const match = sqlQuery.match(/select\s+(.*?)\s+from\s+(\w+)(?:\s+where\s+(.*?))?(?:\s+group\s+by\s+(.*?))?(?:\s+having\s+(.*?))?(?:\s+order\s+by\s+(.*?))?(?:\s+limit\s+(\d+))?(?:\s+offset\s+(\d+))?$/is);

  if (match) {
    result.collection = match[2];

    if (match[3]) {
      result.pipeline.push({ $match: parseWhereClause(match[3]) });
    }

    if (match[4]) {
      const groupStage = parseGroupBy(match[4]);
      const aggregations = parseAggregations(match[1]);
      result.pipeline.push({ $group: { ...groupStage, ...aggregations } });
    }

    if (match[5]) {
      const havingMatch = parseWhereClause(match[5]);
      result.pipeline.push({ $match: havingMatch });
    }

    if (match[6]) {
      result.pipeline.push({ $sort: parseOrderBy(match[6]) });
    }

    if (match[7]) {
      result.pipeline.push({ $limit: parseInt(match[7]) });
    }

    if (match[8]) {
      result.pipeline.push({ $skip: parseInt(match[8]) });
    }
  }

  return result;
};

const parseUpdate = (sqlQuery) => {
  const result = { operation: 'update' };
  const match = sqlQuery.match(/update\s+(\w+)\s+set\s+(.*?)(?:\s+where\s+(.*?))?$/is);
  
  if (match) {
    result.collection = match[1];
    result.update = { $set: parseSetClause(match[2]) };
    
    if (match[3]) {
      result.filter = parseWhereClause(match[3]);
    }
  }

  return result;
};

const parseDelete = (sqlQuery) => {
  const result = { operation: 'delete' };
  const match = sqlQuery.match(/delete\s+from\s+(\w+)(?:\s+where\s+(.*?))?$/is);
  
  if (match) {
    result.collection = match[1];
    
    if (match[2]) {
      result.filter = parseWhereClause(match[2]);
    }
  }

  return result;
};

const parseCreateTable = (sqlQuery) => {
  const result = { operation: 'createTable' };
  const match = sqlQuery.match(/create\s+table\s+(\w+)\s*\((.*?)\)/is);

  if (match) {
    result.tableName = match[1];
    result.columns = parseColumns(match[2]);
  }

  return result;
};

const parseAlterTable = (sqlQuery) => {
  const result = { operation: 'alterTable' };
  const match = sqlQuery.match(/alter\s+table\s+(\w+)\s+(.*)/is);

  if (match) {
    result.tableName = match[1];
    result.alterations = parseAlterations(match[2]);
  }

  return result;
};

const parseDropTable = (sqlQuery) => {
  const result = { operation: 'dropTable' };
  const match = sqlQuery.match(/drop\s+table\s+(\w+)/is);

  if (match) {
    result.tableName = match[1];
  }

  return result;
};

// Helper functions

const parseProjection = (projectionString) => {
  return Object.fromEntries(
    projectionString.split(',').map(field => {
      field = field.trim();
      const [name, alias] = field.split(/\s+as\s+/i);
      return [alias || name, 1];
    })
  );
};

const parseAggregations = (selectClause) => {
  const aggregations = {};
  const regex = /(\w+)\((\w+)\)(?:\s+as\s+(\w+))?/gi;
  let match;
  while ((match = regex.exec(selectClause)) !== null) {
    const [, func, field, alias] = match;
    const key = alias || `${func}_${field}`;
    aggregations[key] = { [`$${func.toLowerCase()}`]: `$${field}` };
  }
  return aggregations;
};

const parseGroupBy = (groupByClause) => {
  const fields = groupByClause.split(',').map(field => field.trim());
  return { _id: fields.length === 1 ? `$${fields[0]}` : Object.fromEntries(fields.map(f => [f, `$${f}`])) };
};

const parseOrderBy = (orderByClause) => {
  return Object.fromEntries(
    orderByClause.split(',').map(item => {
      const [field, direction] = item.trim().split(/\s+/);
      return [field, direction && direction.toLowerCase() === 'desc' ? -1 : 1];
    })
  );
};

const parseWhereClause = (whereClause) => {
  const orConditions = whereClause.split(/\s+or\s+/i).map(orCondition => {
    const andConditions = orCondition.split(/\s+and\s+/i).map(andCondition => {
      const [field, operator, value] = andCondition.split(/\s*(=|!=|>|<|>=|<=|like|in)\s*/i);
      if (operator.toLowerCase() === 'like') {
        return { [field]: { $regex: value.replace(/^'|'$/g, '').replace(/%/g, '.*') } };
      } else if (operator.toLowerCase() === 'in') {
        return { [field]: { $in: parseInClause(value) } };
      } else {
        return { [field]: { [operatorMap[operator.toLowerCase()]]: parseValue(value) } };
      }
    });

    return andConditions.length > 1 ? { $and: andConditions } : andConditions[0];
  });

  return orConditions.length > 1 ? { $or: orConditions } : orConditions[0];
};

const parseInClause = (inClause) => {
  return inClause.replace(/^\(|\)$/g, '').split(',').map(v => parseValue(v.trim()));
};

const parseSetClause = (setClause) => {
  const assignments = setClause.split(',');
  return Object.fromEntries(assignments.map(assignment => {
    const [field, value] = assignment.split('=').map(s => s.trim());
    return [field, parseValue(value)];
  }));
};

const parseValue = (value) => {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  if (value.toLowerCase() === 'null') {
    return null;
  }
  if (value.toLowerCase() === 'true') {
    return true;
  }
  if (value.toLowerCase() === 'false') {
    return false;
  }
  if (!isNaN(value)) {
    return Number(value);
  }
  return value;
};

const parseColumns = (columnsString) => {
  return columnsString.split(',').map(column => {
    const parts = column.trim().split(/\s+/);
    const name = parts[0];
    const type = parts[1];
    const constraints = parts.slice(2).map(c => c.toLowerCase());
    return { name, type, constraints };
  });
};

const parseAlterations = (alterationsString) => {
  const alterations = [];
  const addColumnRegex = /add\s+column\s+(\w+)\s+(\w+)(?:\s+(.*))?/i;
  const dropColumnRegex = /drop\s+column\s+(\w+)/i;
  const modifyColumnRegex = /modify\s+column\s+(\w+)\s+(\w+)(?:\s+(.*))?/i;

  alterationsString.split(',').forEach(alteration => {
    alteration = alteration.trim();
    let match;

    if ((match = addColumnRegex.exec(alteration))) {
      alterations.push({
        type: 'addColumn',
        name: match[1],
        dataType: match[2],
        constraints: match[3] ? match[3].split(/\s+/) : []
      });
    } else if ((match = dropColumnRegex.exec(alteration))) {
      alterations.push({
        type: 'dropColumn',
        name: match[1]
      });
    } else if ((match = modifyColumnRegex.exec(alteration))) {
      alterations.push({
        type: 'modifyColumn',
        name: match[1],
        newDataType: match[2],
        newConstraints: match[3] ? match[3].split(/\s+/) : []
      });
    }
  });

  return alterations;
};

const operatorMap = {
  '=': '$eq',
  '!=': '$ne',
  '>': '$gt',
  '<': '$lt',
  '>=': '$gte',
  '<=': '$lte'
};

// Example input
const a = `INSERT INTO products (name, price, category) VALUES ('Product1', 120, 'electronics'), ('Product2', 80, 'clothing') `;
console.log(sqlToJson(a));

module.exports = sqlToJson;
