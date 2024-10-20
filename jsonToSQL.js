const jsonToSql = (json) => {
  json = JSON.parse(json);
  switch (json.operation) {
    case 'insert':
    case 'insertOne':
    case 'insertMany':
      return insertToSql(json);
    case 'find':
      return findToSql(json);
    case 'update':
    case 'updateOne':
    case 'updateMany':
      return updateToSql(json);
    case 'delete':
    case 'deleteOne':
    case 'deleteMany':
      return deleteToSql(json);
    case 'createTable':
    case 'createCollection':
      return createTableToSql(json);
    case 'alterTable':
      return alterTableToSql(json);
    case 'dropTable':
      return dropTableToSql(json);
    case 'aggregate':
      return aggregateToSql(json);
    default:
      throw new Error('Unsupported operation');
  }
};

const createTableToSql = (json) => {
  const { collection, schema, foreignKeys, options } = json;

  // Extract columns and types from the schema
  const columns = Object.entries(schema).map(([field, details]) => {
    return `${field} ${typeToSql(details.type)}${details.unique ? ' UNIQUE' : ''}${details.required ? ' NOT NULL' : ''}`;
  }).join(', ');

  let sql = `CREATE TABLE ${collection} (${columns}`;

  // Add foreign keys if they exist
  if (foreignKeys && foreignKeys.length > 0) {
    const foreignKeyClauses = foreignKeys.map(fk => {
      return `FOREIGN KEY (${fk.column}) REFERENCES ${fk.reference.table}(${fk.reference.column})`;
    }).join(', ');

    sql += `, ${foreignKeyClauses}`;
  }

  sql += ')';

  // Add primary key if provided in options
  if (options && options.primaryKey) {
    sql += `, PRIMARY KEY(${options.primaryKey})`;
  }

  return sql.trim();
};

const typeToSql = (type) => {
  switch (type.toLowerCase()) {
    case 'string':
      return 'VARCHAR(255)';
    case 'number':
      return 'INTEGER';
    case 'boolean':
      return 'BOOLEAN';
    case 'date':
      return 'DATE';
    case 'mixed': // Handle "Mixed" type
      return 'TEXT'; // or 'JSON' if your database supports JSON data type
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
};

// Helper for sort logic
const sortToSql = (sort) => {
  return Object.entries(sort).map(([field, direction]) => {
    return `${field} ${direction === 1 ? 'ASC' : 'DESC'}`;
  }).join(', ');
};


const insertToSql = (json) => {
  const { collection, documents } = json;
  if (!documents || documents.length === 0) {
    throw new Error('No documents provided for insert operation');
  }
  const columns = Object.keys(documents[0]);
  const values = documents.map(doc => {
    return `(${Object.values(doc).map(formatValue).join(', ')})`;
  }).join(', ');

  return `INSERT INTO ${collection} (${columns.join(', ')}) VALUES ${values}`;
};



const deleteToSql = (json) => {
  const { collection, filter } = json;
  let sql = `DELETE FROM ${collection} `;

  if (filter) {
    sql += `WHERE ${filterToSql(filter)} `;
  }

  return sql.trim();
};


const alterTableToSql = (json) => {
  const { collection, fields } = json;
  const columns = Object.entries(fields).map(([field, type]) => {
    return `ADD COLUMN ${field} ${typeToSql(type)}`;
  }).join(', ');

  return `ALTER TABLE ${collection} ${columns}`;
};

const dropTableToSql = (json) => {
  const { collection } = json;
  return `DROP TABLE ${collection}`;
};





const aggregateToSql = (json) => {
  const { collection, pipeline } = json;
  let sql = `SELECT `;

  const projectStage = pipeline.find(stage => stage.$project);
  const groupStage = pipeline.find(stage => stage.$group);

  if (groupStage) {
    const groupFields = Object.entries(groupStage.$group).map(([field, value]) => {
      if (field === '_id') {
        if (typeof value === 'object') {
          return Object.entries(value).map(([key, val]) => 
            `${val.substring(1)} AS ${key}`
          ).join(', ');
        }
        return value.substring(1);
      } else {
        return aggregationToSql(field, value);
      }
    }).join(', ');

    sql += groupFields;
  } else if (projectStage) {
    const fields = Object.keys(projectStage.$project)
      .filter(key => projectStage.$project[key] !== 0)
      .map(field => field)
      .join(', ');
    sql += fields;
  } else {
    sql += '*';
  }

  sql += ` FROM ${collection} `;

  const matchStage = pipeline.find(stage => stage.$match);
  if (matchStage) {
    sql += `WHERE ${filterToSql(matchStage.$match)} `;
  }

  if (groupStage) {
    const groupByFields = Object.values(groupStage.$group._id).map(f => f.substring(1)).join(', ');
    sql += `GROUP BY ${groupByFields} `;
  }

  const sortStage = pipeline.find(stage => stage.$sort);
  if (sortStage) {
    sql += ` ORDER BY ${sortToSql(sortStage.$sort)}`;
  }

  const limitStage = pipeline.find(stage => stage.$limit);
  if (limitStage) {
    sql += ` LIMIT ${limitStage.$limit}`;
  }

  const skipStage = pipeline.find(stage => stage.$skip);
  if (skipStage) {
    sql += ` OFFSET ${skipStage.$skip}`;
  }

  return sql.trim();
};

const aggregationToSql = (field, value) => {
  if (value.$sum) {
    return `SUM(${value.$sum.substring(1)}) AS ${field}`;
  } else if (value.$avg) {
    return `AVG(${value.$avg.substring(1)}) AS ${field}`;
  } else if (value.$min) {
    return `MIN(${value.$min.substring(1)}) AS ${field}`;
  } else if (value.$max) {
    return `MAX(${value.$max.substring(1)}) AS ${field}`;
  } else if (value.$count) {
    return `COUNT(${value.$count.substring(1)}) AS ${field}`;
  } else if (value.$first) {
    return `MIN(${value.$first.substring(1)}) AS ${field}`; // Approximation in SQL
  } else if (value.$last) {
    return `MAX(${value.$last.substring(1)}) AS ${field}`; // Approximation in SQL
  } else if (value.$push) {
    return `GROUP_CONCAT(${value.$push.substring(1)}) AS ${field}`; // MySQL-specific, adjust for other databases
  } else if (value.$addToSet) {
    return `GROUP_CONCAT(DISTINCT ${value.$addToSet.substring(1)}) AS ${field}`; // MySQL-specific, adjust for other databases
  } else if (value.$stdDevPop) {
    return `STDDEV_POP(${value.$stdDevPop.substring(1)}) AS ${field}`;
  } else if (value.$stdDevSamp) {
    return `STDDEV_SAMP(${value.$stdDevSamp.substring(1)}) AS ${field}`;
  }
  // Add more aggregation functions as needed
  throw new Error(`Unsupported aggregation operation: ${Object.keys(value)[0]}`);
};


const updateToSql = (json) => {
  const { collection, filter, update } = json;
  let sql = `UPDATE ${collection} SET `;

  const updates = Object.entries(update.$set).map(([field, value]) => {
    if (field === '_id') {
      throw new Error('Cannot update _id field');
    }
    return `${field} = ${formatValue(value)}`;
  }).join(', ');

  sql += `${updates} `;

  if (filter) {
    sql += `WHERE ${handleNestedQuery(filter)}`;
  }

  return sql.trim();
};

const findToSql = (json) => {
  const { collection, projection, filter, sort, limit, skip } = json;
  const fields = Object.keys(projection || {}).length > 0 ? Object.keys(projection).map(field => {
    return field === '_id' ? field : `${field} AS ${field}`;
  }).join(', ') : '*';

  let sql = `SELECT ${fields} FROM ${collection} `;

  if (filter) {
    sql += `WHERE ${filterToSql(filter)} `;
  }

  if (sort) {
    sql += `ORDER BY ${sortToSql(sort)} `;
  }

  if (limit) {
    sql += `LIMIT ${limit} `;
  }

  if (skip) {
    sql += `OFFSET ${skip} `;
  }

  return sql.trim();
};

const handleNestedQuery = (filter) => {
  if (typeof filter !== 'object' || filter === null) return filterToSql(filter);

  const conditions = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key === '$and') {
      conditions.push(`(${value.map(handleNestedQuery).join(' AND ')})`);
    } else if (typeof value === 'object' && value !== null) {
      if (value.$in && Array.isArray(value.$in) && value.$in[0].operation === 'find') {
        // Construct the nested subquery correctly using findToSql
        const nestedSql = findToSql(value.$in[0]);
        conditions.push(`${key} IN (${nestedSql})`);
      } else {
        conditions.push(filterToSql({ [key]: value }));
      }
    } else {
      conditions.push(`${key} = ${formatValue(value)}`);
    }
  }
  return conditions.join(' AND ');
};

const filterToSql = (filter) => {
  return Object.entries(filter).map(([field, condition]) => {
    if (typeof condition === 'object') {
      if (condition.$eq) {
        return `${field} = ${formatValue(condition.$eq)}`;
      } else if (condition.$ne) {
        return `${field} != ${formatValue(condition.$ne)}`;
      } else if (condition.$gt) {
        return `${field} > ${formatValue(condition.$gt)}`;
      } else if (condition.$lt) {
        return `${field} < ${formatValue(condition.$lt)}`;
      } else if (condition.$gte) {
        return `${field} >= ${formatValue(condition.$gte)}`;
      } else if (condition.$lte) {
        return `${field} <= ${formatValue(condition.$lte)}`;
      } else if (condition.$in) {
        return `${field} IN (${condition.$in.map(formatValue).join(', ')})`;
      } else if (condition.$nin) {
        return `${field} NOT IN (${condition.$nin.map(formatValue).join(', ')})`;
      } else if (condition.$regex) {
        return `${field} REGEXP ${formatValue(condition.$regex)}`;
      } else if (condition.$exists) {
        return `${field} IS ${condition.$exists ? 'NOT NULL' : 'NULL'}`;
      } else if (condition.$type) {
        return `${field} IS ${typeToSql(condition.$type)}`;
      }
    } else {
      return `${field} = ${formatValue(condition)}`;
    }
  }).join(' AND ');
};




const formatValue = (value) => {
  if (typeof value === 'string') {
    return `'${value}' `;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  } else if (value === null) {
    return 'NULL';
  } else if (Array.isArray(value)) {
    return `(${value.map(formatValue).join(', ')})`;
  } else if (typeof value === 'object') {
    return `'${JSON.stringify(value)}'`;
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
};


const exampleNestedAggregate = `{
  "operation": "createTable",
  "tableName": "users",
  "columns": [
    {
      "name": "CREATE",
      "type": "VARCHAR(255)",
      "constraints": []
    },
    {
      "name": "id",
      "type": "INTEGER",
      "constraints": []
    },
    {
      "name": "username",
      "type": "VARCHAR(255)",
      "constraints": [
        "NOT NULL"
      ]
    },
    {
      "name": "email",
      "type": "VARCHAR(255)",
      "constraints": [
        "NOT NULL"
      ]
    },
    {
      "name": "age",
      "type": "INTEGER",
      "constraints": []
    },
    {
      "name": "created_at",
      "type": "VARCHAR(255)",
      "constraints": []
    }
  ]
}`;

console.log(jsonToSql(exampleNestedAggregate));