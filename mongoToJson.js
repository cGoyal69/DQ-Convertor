function mongoToJson(queryString) {
  // Remove line breaks and extra spaces
  queryString = queryString.replace(/\s+/g, ' ').trim();

  // Updated regex to capture more complex queries
  const match = queryString.match(/db(?:\.(\w+))?\.(\w+)\(([\s\S]*)\)(.*)$/);
  if (!match) {
    throw new Error('Invalid MongoDB query string format');
  }

  const [, database, operation, args, chainedMethods] = match;

  let argsArray;
  try {
    argsArray = parseArguments(args);
  } catch (error) {
    throw new Error(`Failed to parse arguments: ${error.message}`);
  }

  let result = {
    collection: database,
    operation
  };

  switch (operation) {
    case 'find':
    case 'findOne':
      if (argsArray[0]) result.filter = argsArray[0];
      if (argsArray[1]) result.projection = argsArray[1];
      break;
    case 'insertOne':
    case 'insertMany':
      result.documents = argsArray[0];
      break;
    case 'updateOne':
    case 'updateMany':
      result.filter = argsArray[0];
      result.update = argsArray[1];
      break;
    case 'deleteOne':
    case 'deleteMany':
      result.filter = argsArray[0];
      break;
    case 'aggregate':
      result.pipeline = argsArray[0];
      break;
    case 'createCollection':
      result = handleCreateCollection(database, argsArray);
      break;
    case 'createIndex':
      result.keys = argsArray[0];
      if (argsArray[1]) result.options = argsArray[1];
      break;
    case 'dropIndex':
      result.indexName = argsArray[0];
      break;
    case 'dropCollection':
    case 'drop':
      // No additional parameters needed
      break;
    case 'bulkWrite':
      result.operations = argsArray[0];
      break;
    case 'countDocuments':
    case 'estimatedDocumentCount':
      if (argsArray[0]) result.filter = argsArray[0];
      break;
    case 'distinct':
      result.field = argsArray[0];
      if (argsArray[1]) result.filter = argsArray[1];
      break;
    case 'findOneAndDelete':
    case 'findOneAndReplace':
    case 'findOneAndUpdate':
      result.filter = argsArray[0];
      if (argsArray[1]) {
        result[operation === 'findOneAndDelete' ? 'options' : 'update'] = argsArray[1];
      }
      break;
    case 'mapReduce':
      result.map = argsArray[0].toString();
      result.reduce = argsArray[1].toString();
      if (argsArray[2]) result.options = argsArray[2];
      break;
    case 'watch':
      if (argsArray[0]) result.pipeline = argsArray[0];
      break;
    default:
      throw new Error(`Unsupported operation: ${operation}`);
  }

  // Handle chained methods
  if (chainedMethods) {
    const chainedMethodsMatch = chainedMethods.match(/\.(\w+)\(([\s\S]*?)\)/g);
    if (chainedMethodsMatch) {
      chainedMethodsMatch.forEach(methodString => {
        const [, method, args] = methodString.match(/\.(\w+)\(([\s\S]*?)\)/);
        const parsedArgs = parseArguments(args);
        
        switch (method) {
          case 'limit':
          case 'skip':
            result[method] = parseInt(parsedArgs[0], 10);
            break;
          case 'sort':
          case 'project':
          case 'collation':
          case 'hint':
            result[method] = parsedArgs[0];
            break;
          case 'count':
            result.count = true;
            break;
          case 'explain':
            result.explain = parsedArgs[0] || true;
            break;
          case 'comment':
            result.comment = parsedArgs[0];
            break;
          case 'maxTimeMS':
            result.maxTimeMS = parseInt(parsedArgs[0], 10);
            break;
        }
      });
    }
  }

  return JSON.stringify(result, null, 2);
}

function handleCreateCollection(database, argsArray) {
  const result = {
    operation: "createTable",
    tableName: argsArray[0],
    columns: []
  };

  if (argsArray[1] && argsArray[1].validator && argsArray[1].validator.$jsonSchema) {
    const schema = argsArray[1].validator.$jsonSchema;
    const properties = schema.properties || {};
    const required = schema.required || [];

    for (const [name, prop] of Object.entries(properties)) {
      const column = {
        name: name,
        type: mongoTypeToSqlType(prop.bsonType),
        constraints: []
      };

      if (required.includes(name)) {
        column.constraints.push("NOT NULL");
      }

      if (name === "_id") {
        column.constraints.push("PRIMARY KEY");
      }

      result.columns.push(column);
    }
  }

  return result;
}

function mongoTypeToSqlType(bsonType) {
  const typeMap = {
    'objectId': 'VARCHAR(24)',
    'string': 'VARCHAR(255)',
    'int': 'INTEGER',
    'long': 'BIGINT',
    'double': 'DOUBLE PRECISION',
    'bool': 'BOOLEAN',
    'date': 'TIMESTAMP',
    'array': 'JSON',
    'object': 'JSON'
  };

  return typeMap[bsonType] || 'VARCHAR(255)';
}

function parseArguments(argsString) {
  let args = [];
  let currentArg = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];

    if (inString) {
      if (char === stringChar && argsString[i - 1] !== '\\') {
        inString = false;
      }
      currentArg += char;
    } else if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      currentArg += char;
    } else if (char === '{' || char === '[') {
      depth++;
      currentArg += char;
    } else if (char === '}' || char === ']') {
      depth--;
      currentArg += char;
    } else if (char === ',' && depth === 0) {
      args.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += char;
    }
  }

  if (currentArg.trim()) {
    args.push(currentArg.trim());
  }

  return args.map(arg => {
    try {
      return Function(`return ${arg}`)();
    } catch {
      return arg;
    }
  });
}

//module.exports = mongoToJson;

console.log(mongoToJson(`db.users.updateMany({ order_id: { $in: [ { operation: "find", collection: "order_items", projection: { order_id: 1 }, filter: { $and: [ { product_id: { $eq: 123 } }, { name: { $in: [ "Kavyaa", "Lakshita", "'Cou" ] } } ] } } ] } }, { $set: { age: 31, a: "b" } })`));
console.log(mongoToJson(`db.createCollection("employees", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "age", "department_id"],
      properties: {
        _id: {
          bsonType: "objectId",
          description: "must be an ObjectId and is the primary key"
        },
        name: {
          bsonType: "string",
          description: "must be a string and is required"
        },
        age: {
          bsonType: "int",
          minimum: 18,
          description: "must be an integer and is required, age must be >= 18"
        },
        department_id: {
          bsonType: "objectId",
          description: "must be an ObjectId and reference the _id from the departments collection"
        }
      }
    }
  }
})`));
console.log(mongoToJson(`
db.createCollection("users", {
  "validator": {
    "$jsonSchema": {
      "bsonType": "object",
      "required": [
        "username",
        "email"
      ],
      "properties": {
        "CREATE": {
          "bsonType": "string"
        },
        "id": {
          "bsonType": "int"
        },
        "username": {
          "bsonType": "string",
          "unique": true
        },
        "email": {
          "bsonType": "string",
          "unique": true
        },
        "age": {
          "bsonType": "int"
        },
        "created_at": {
          "bsonType": "timestamp"
        }
      }
    }
  }
})`));