const jsonToSql = (Json) => {
  const ogjson = JSON.stringify(Json)
  const json = JSON.parse(ogjson);
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

const aggregateToSql = (json) => {
  const { collection, pipeline } = json;
  let sql = `SELECT `;

  const groupBy = pipeline.find(stage => stage.$group);
  if (groupBy) {
    const groupFields = Object.keys(groupBy.$group).map(field => {
      return `${field === '_id' ? field : `AVG(${field}) AS ${field}`}`;
    }).join(', ');

    sql += `${groupFields} FROM ${collection} `;

    const matchStage = pipeline.find(stage => stage.$match);
    if (matchStage) {
      sql += `WHERE ${filterToSql(matchStage.$match)} `;
    }

    sql += `GROUP BY ${groupBy.$group._id}`;
  } else {
    sql += `* FROM ${collection} `;
  }

  const sortStage = pipeline.find(stage => stage.$sort);
  if (sortStage) {
    sql += ` ORDER BY ${sortToSql(sortStage.$sort)}`;
  }

  const limitStage = pipeline.find(stage => stage.$limit);
  if (limitStage) {
    sql += ` LIMIT ${limitStage.$limit}`;
  }

  return sql.trim();
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

const findToSql = (json) => {
  const { collection, projection, filter, sort, limit, skip } = json;
  const fields = Object.keys(projection || {}).length > 0 ? Object.keys(projection).join(', ') : '*';
  let sql = `SELECT ${fields} FROM ${collection}`;

  if (filter) {
    sql += ` WHERE ${filterToSql(filter)}`;
  }

  if (sort) {
    sql += ` ORDER BY ${sortToSql(sort)}`;
  }

  if (limit) {
    sql += ` LIMIT ${limit}`;
  }

  if (skip) {
    sql += ` OFFSET ${skip}`;
  }

  return sql;
};

const filterToSql = (filter) => {
  if (Array.isArray(filter.$and)) {
    return filter.$and.map(subFilter => `(${filterToSql(subFilter)})`).join(' AND ');
  }

  if (Array.isArray(filter.$or)) {
    return filter.$or.map(subFilter => `(${filterToSql(subFilter)})`).join(' OR ');
  }

  if (Array.isArray(filter.$not)) {
    return `NOT (${filterToSql(filter.$not[0])})`;
  }

  return Object.entries(filter).map(([field, condition]) => {
    if (typeof condition === 'object') {
      const [operator, value] = Object.entries(condition)[0];
      switch (operator) {
        case '$eq':
          return `${field} = ${formatValue(value)}`;
        case '$ne':
          return `${field} != ${formatValue(value)}`;
        case '$gt':
          return `${field} > ${formatValue(value)}`;
        case '$lt':
          return `${field} < ${formatValue(value)}`;
        case '$gte':
          return `${field} >= ${formatValue(value)}`;
        case '$lte':
          return `${field} <= ${formatValue(value)}`;
        case '$in':
          return `${field} IN (${Array.isArray(value) ? value.map(formatValue).join(', ') : formatValue(value)})`;
        case '$nin':
          return `${field} NOT IN (${Array.isArray(value) ? value.map(formatValue).join(', ') : formatValue(value)})`;
        case '$regex':
          return `${field} LIKE ${formatValue(value.replace(/^\^|\$$/g, '%'))}`;
        case '$not':
          return `NOT (${field} LIKE ${formatValue(value.replace(/^\^|\$$/g, '%'))})`;
        case '$exists':
          return `${field} IS ${value ? 'NOT NULL' : 'NULL'}`;
        case '$type':
          return `${field} IS ${value}`;
        case '$mod':
          return `${field} % ${value[0]} = ${value[1]}`;
        case '$all':
          return `${field} IN (${value.map(formatValue).join(', ')})`;
        case '$elemMatch':
          return `${field} IN (${Object.entries(value).map(([key, val]) => `${key} = ${formatValue(val)}`).join(', ')})`;
        case '$size':
          return `LENGTH(${field}) = ${value}`;
        default:
          throw new Error(`Unsupported operator: ${operator }`);
      }
    } else {
      return `${field} = ${formatValue(condition)}`;
    }
  }).join(' AND ');
};
const sortToSql = (sort) => {
  return Object.entries(sort).map(([field, direction]) => `${field} ${direction === 1 ? 'ASC' : 'DESC'}`).join(', ');
};

const formatValue = (value) => {
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`;
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (value === null) {
    return 'NULL';
  }
  return value;
};

const updateToSql = (json) => {
  const { collection, update, filter } = json;
  if (!update || !update.$set) {
    throw new Error('Invalid update operation structure');
  }
  const setClause = Object.entries(update.$set).map(([field, value]) => `${field} = ${formatValue(value)}`).join(', ');
  let sql = `UPDATE ${collection} SET ${setClause}`;

  if (filter) {
    sql += ` WHERE ${filterToSql(filter)}`;
  }

  return sql;
};

const deleteToSql = (json) => {
  const { collection, filter } = json;
  let sql = `DELETE FROM ${collection}`;

  if (filter) {
    sql += ` WHERE ${filterToSql(filter)}`;
  }

  return sql;
};

const createTableToSql = (json) => {
  const { tableName, columns } = json;
  const columnDefinitions = columns.map(column => {
    let def = `${column.name} ${column.type.toUpperCase()}`;
    if (column.constraints) {
      def += ` ${column.constraints.join(' ')}`;
    }
    return def;
  }).join(', ');

  return `CREATE TABLE ${tableName} (${columnDefinitions})`;
};

const alterTableToSql = (json) => {
  const { tableName, alterations } = json;
  const alterClauses = alterations.map(alteration => {
    switch (alteration.type) {
      case 'addColumn':
        return `ADD COLUMN ${alteration.name} ${alteration.dataType.toUpperCase()} ${alteration.constraints.join(' ')}`;
      case 'dropColumn':
        return `DROP COLUMN ${alteration.name}`;
      case 'modifyColumn':
        return `MODIFY COLUMN ${alteration.name} ${alteration.newDataType.toUpperCase()} ${alteration.newConstraints.join(' ')}`;
      default:
        throw new Error(`Unsupported alteration type: ${alteration.type}`);
    }
  });

  return `ALTER TABLE ${tableName} ${alterClauses.join(', ')}`;
};

const dropTableToSql = (json) => {
  return `DROP TABLE ${json.tableName}`;
};

// Example Operations


const exampleInsert = `{
  "collection": "products",
  "operation": "insertMany",
  "documents": [
    {"name": "Product1", "price": 120, "category": "electronics"},
    {"name": "Product2", "price": 80, "category": "clothing"}
  ]
}`;

const exampleFind = `{
  "collection": "products",
  "operation": "find",
  "filter": {"category": "electronics"},
  "projection": {"name": 1, "price": 1},
  "sort": {"price": -1},
  "limit": 10
}`;

const exampleUpdate = `{
  "operation": "update",
  "collection": "products",
  "update": {"$set": {"avg_price": 150}},
  "filter": {"avg_price": {"$nin": 100}}
}`;

const exampleDelete = `{
  "operation": "delete",
  "collection": "users",
  "filter": {"age": {"$ne": 20}}
}`;

const exampleCreateTable = `{
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

const exampleDropTable = `{
    "operation": "deleteMany",
    "collection": "users",
    "filter": {
        "order_id": {
            "$in": [
                {
                    "operation": "find",
                    "collection": "order_items",
                    "projection": {
                        "order_id": 1
                    },
                    "filter": {
                        "$and": [
                            {
                                "product_id": {
                                    "$eq": 123
                                }
                            },
                            {
                                "name": {
                                    "$in": [
                                        "Kavyaa",
                                        "Lakshita",
                                        "'Cou"
                                    ]
                                }
                            }
                        ]
                    }
                }
            ]
        }
    }
}`;

// Test the functions

console.log(jsonToSql(exampleInsert));
console.log(jsonToSql(exampleFind));
console.log(jsonToSql(exampleUpdate));
// console.log(jsonToSql(exampleDelete));
console.log(jsonToSql(exampleCreateTable));
console.log(jsonToSql(exampleDropTable));

//module.exports = jsonToSql;