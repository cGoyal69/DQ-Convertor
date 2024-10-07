function intermediateToMongo(intermediate) {
  if (!intermediate || typeof intermediate !== 'object') {
    throw new Error('Invalid intermediate object');
  }

  const { operation, collection } = intermediate;

  if (!operation || !collection) {
    throw new Error('Operation and collection are required');
  }

  switch (operation.toLowerCase()) {
    case 'find':
      return generateFindQuery(intermediate);
    case 'aggregate':
      return generateAggregateQuery(intermediate);
    case 'insertone':
      return generateInsertOneQuery(intermediate);
    case 'insertmany':
      return generateInsertManyQuery(intermediate);
    case 'updateone':
      return generateUpdateQuery(intermediate, 'updateOne');
    case 'updatemany':
      return generateUpdateQuery(intermediate, 'updateMany');
    case 'deleteone':
      return generateDeleteQuery(intermediate, 'deleteOne');
    case 'deletemany':
      return generateDeleteQuery(intermediate, 'deleteMany');
    case 'delete':
      return generateDeleteQuery(intermediate, 'delete');
    case 'count':
      return generateCountQuery(intermediate);
    case 'distinct':
      return generateDistinctQuery(intermediate);
    case 'update': // Added this case
      return generateUpdateQuery(intermediate, 'updateOne'); // or 'updateMany' based on your requirement
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }
}

function generateFindQuery(intermediate) {
  const { collection, filter, projection, sort, limit, skip } = intermediate;
  let query = `db.${collection}.find(`;

  query += filter ? `${JSON.stringify(generateFilter(filter))}, ` : '{}, ';

  if (projection) {
    query += JSON.stringify(convertProjection(projection));
  } else {
    query += '{}';
  }

  query += ')';

  if (sort) {
    query += `.sort(${JSON.stringify(convertSort(sort))})`;
  }

  if (limit) query += `.limit(${limit})`;
  if (skip) query += `.skip(${skip})`;

  return query;
}

function generateAggregateQuery(intermediate) {
  const { collection, pipeline } = intermediate;

  if (!Array.isArray(pipeline)) {
    throw new Error('Aggregate pipeline must be an array');
  }

  const processedPipeline = pipeline.map(stage => {
    const [operator, content] = Object.entries(stage)[0];
    switch (operator) {
      case '$match':
        return { $match: generateFilter(content) };
      case '$group':
        return { $group: convertGroupStage(content) };
      case '$project':
        return { $project: convertProjection(content) };
      case '$sort':
        return { $sort: convertSort(content) };
      default:
        return stage;
    }
  });

  return `db.${collection}.aggregate(${JSON.stringify(processedPipeline)})`;
}

function generateInsertOneQuery(intermediate) {
  const { collection, document } = intermediate;
  return `db.${collection}.insertOne(${JSON.stringify(document)})`;
}

function generateInsertManyQuery(intermediate) {
  const { collection, documents } = intermediate;
  return `db.${collection}.insertMany(${JSON.stringify(documents)})`;
}

function generateUpdateQuery(intermediate, updateType) {
  const { collection, filter, update, upsert, arrayFilters } = intermediate;
  let query = `db.${collection}.${updateType}(`;

  // Use simplified filter
  query += `${JSON.stringify(generateFilter(filter))}, `;

  // Use $set for updates
  query += `${JSON.stringify(convertUpdate(update))}`; // Remove useSet parameter

  const options = {};
  if (upsert) options.upsert = true;
  if (arrayFilters) options.arrayFilters = arrayFilters;

  if (Object.keys(options).length > 0) {
    query += `, ${JSON.stringify(options)}`;
  }

  query += ')';
  return query;
}

function generateDeleteQuery(intermediate, deleteType) {
  const { collection, filter } = intermediate;
  if (deleteType === 'delete') {
    return `db.${collection}.deleteMany(${JSON.stringify(generateFilter(filter))})`;
  } else {
    return `db.${collection}.${deleteType}(${JSON.stringify(generateFilter(filter))})`;
  }
}

function generateCountQuery(intermediate) {
  const { collection, filter } = intermediate;
  return `db.${collection}.countDocuments(${JSON.stringify(generateFilter(filter))})`;
}

function generateDistinctQuery(intermediate) {
  const { collection, field, filter } = intermediate;
  let query = `db.${collection}.distinct("${field}"`;
  if (filter) {
    query += `, ${JSON.stringify(generateFilter(filter))}`;
  }
  query += ')';
  return query;
}

function generateFilter(conditions) {
  if (!conditions) return {};

  if (conditions.or && Array.isArray(conditions.or)) {
    const orConditions = conditions.or.map(andGroup => {
      if (Array.isArray(andGroup)) {
        return andGroup.length === 1 ? convertConditionToMongo(andGroup[0]) : { $and: andGroup.map(convertConditionToMongo) };
      } else {
        return convertConditionToMongo(andGroup);
      }
    });
    return orConditions.length > 1 ? { $or: orConditions } : orConditions[0];
  } else {
    return convertConditionToMongo(conditions);
  }
}

function convertConditionToMongo(condition) {
  if (typeof condition !== 'object') return condition;

  const { field, operator, value } = condition;
  switch (operator?.toLowerCase()) {
    case '=': return { [field]: value };
    case '!=': return { [field]: { $ne: value } };
    case '>': return { [field]: { $gt: value } };
    case '<': return { [field]: { $lt: value } };
    case '>=': return { [field]: { $gte: value } };
    case '<=': return { [field]: { $lte: value } };
    case 'in': return { [field]: { $in: Array.isArray(value) ? value : [value] } };
    case 'not in': return { [field]: { $nin: Array.isArray(value) ? value : [value] } };
    case 'like': return { [field]: { $regex: value.replace(/%/g, '.*'), $options: 'i' } };
    case 'is null': return { [field]: null };
    case 'is not null': return { [field]: { $ne: null } };
    default: return condition;
  }
}

function convertProjection(projection) {
  if (Array.isArray(projection)) {
    return projection.reduce((acc, field) => {
      const [name, alias] = field.split(/\s+as\s+/i).map(f => f.trim());
      acc[alias || name] = `$${name}`;
      return acc;
    }, {});
  } else if (typeof projection === 'object') {
    return projection;
  }
  return {};
}

function convertSort(sort) {
  if (Array.isArray(sort)) {
    return sort.reduce((acc, item) => {
      if (typeof item === 'object' && item.field) {
        acc[item.field] = item.order?.toLowerCase() === 'desc' ? -1 : 1;
      } else if (typeof item === 'string') {
        const [field, order] = item.split(/\s+/);
        acc[field] = order?.toLowerCase() === 'desc' ? -1 : 1;
      }
      return acc;
    }, {});
  } else if (typeof sort === 'object') {
    return Object.entries(sort).reduce((acc, [field, order]) => {
      acc[field] = order === -1 || order?.toLowerCase() === 'desc' ? -1 : 1;
      return acc;
    }, {});
  }
  return {};
}

function convertGroupStage(group) {
  const result = { _id: group._id || null };
  Object.entries(group).forEach(([key, value]) => {
    if (key !== '_id') {
      if (typeof value === 'string') {
        result[key] = { $first: `$${value}` };
      } else {
        result[key] = value;
      }
    }
  });
  return result;
}

function convertUpdate(update) {
  const result = {};
  Object.entries(update).forEach(([key, value]) => {
    result[key] = value; // Store fields directly for $set
  });
  return { $set: result }; // Wrap fields in $set
}

// Test function
function testIntermediateToMongo(intermediateJson) {
  try {
    return intermediateToMongo(intermediateJson);
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Example usage
const sampleIntermediateJson = {
  "operation": "update",
  "collection": "users",
  "update": {
    "age": 31,
    "last_login": "2023-05-01"
  },
  "filter": {
    "id": {
      "$eq": 1
    }
  }
};

console.log('Sample Intermediate JSON:');
console.log(JSON.stringify(sampleIntermediateJson, null, 2));
console.log('Generated MongoDB Query:');
console.log(testIntermediateToMongo(sampleIntermediateJson));
