function mongoToJson(queryString) {
  // Remove line breaks and extra spaces
  queryString = queryString.replace(/\s+/g, ' ').trim();

  // Updated regex to capture chained methods
  const match = queryString.match(/db\.(\w+)\.(\w+)\(([\s\S]*?)\)(\.(\w+)\(([^)]*)\))*/);
  if (!match) {
      throw new Error('Invalid MongoDB query string format');
  }

  const [, collection, operation, args, , chainedMethod, chainedArgs] = match;

  let argsArray;
  try {
      argsArray = eval(`[${args}]`);
  } catch (error) {
      throw new Error(`Failed to parse arguments: ${error.message}`);
  }

  const result = {
      collection,
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
      default:
          throw new Error(`Unsupported operation: ${operation}`);
  }

  // Handle chained methods
  if (chainedMethod) {
      switch (chainedMethod) {
          case 'limit':
              result.limit = parseInt(chainedArgs, 10);
              break;
          case 'sort':
              result.sort = eval(`(${chainedArgs})`);
              break;
          case 'skip':
              result.skip = parseInt(chainedArgs, 10);
              break;
          case 'count':
              result.count = true;
              break;
          case 'distinct':
              result.distinct = eval(`(${chainedArgs})`);
              break;
          case 'explain':
              result.explain = true;
              break;
          case 'hint':
              result.hint = eval(`(${chainedArgs})`);
              break;
          case 'collation':
              result.collation = eval(`(${chainedArgs})`);
              break;
          case 'comment':
              result.comment = eval(`(${chainedArgs})`);
              break;
          case 'maxTimeMS':
              result.maxTimeMS = parseInt(chainedArgs, 10);
              break;
          case 'min':
          case 'max':
              result[chainedMethod] = eval(`(${chainedArgs})`);
              break;
          case 'returnKey':
          case 'showRecordId':
          case 'tailable':
          case 'oplogReplay':
          case 'noCursorTimeout':
          case 'awaitData':
          case 'allowPartialResults':
              result[chainedMethod] = eval(`(${chainedArgs})`);
              break;
          default:
              console.warn(`Unhandled chained method: ${chainedMethod}`);
      }
  }

  // Handle options passed as the last argument
  if (argsArray[argsArray.length - 1] && typeof argsArray[argsArray.length - 1] === 'object') {
      const options = argsArray[argsArray.length - 1];
      if (options.sort) result.sort = options.sort;
      if (options.limit) result.limit = options.limit;
      if (options.skip) result.skip = options.skip;
  }

  return JSON.stringify(result);
}

// Example usage
const postgresQuery = `db.createCollection("myCollection", { capped: true, size: 5242880, max: 5000 })`;
console.log(mongoToJson(postgresQuery));
  module.exports = mongoToJson;