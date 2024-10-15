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
    if (chainedMethod) {
      switch (chainedMethod) {
        case 'limit':
          result.limit = parseInt(chainedArgs);
          break;
        case 'sort':
          result.sort = eval(`(${chainedArgs})`);
          break;
        case 'skip':
          result.skip = parseInt(chainedArgs);
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
          result.maxTimeMS = parseInt(chainedArgs);
          break;
        case 'min':
          result.min = eval(`(${chainedArgs})`);
          break;
        case 'max':
          result.max = eval(`(${chainedArgs})`);
          break;
        case 'returnKey':
          result.returnKey = eval(`(${chainedArgs})`);
          break;
        case 'showRecordId':
          result.showRecordId = eval(`(${chainedArgs})`);
          break;
        case 'tailable':
          result.tailable = eval(`(${chainedArgs})`);
          break;
        case 'oplogReplay':
          result.oplogReplay = eval(`(${chainedArgs})`);
          break;
        case 'noCursorTimeout':
          result.noCursorTimeout = eval(`(${chainedArgs})`);
          break;
        case 'awaitData':
          result.awaitData = eval(`(${chainedArgs})`);
          break;
        case 'allowPartialResults':
          result.allowPartialResults = eval(`(${chainedArgs})`);
          break;
        default:
          console.warn(`Unhandled chained method: ${chainedMethod}`);
      }
    }
  
    if (argsArray[argsArray.length - 1] && typeof argsArray[argsArray.length - 1] === 'object') {
      const options = argsArray[argsArray.length - 1];
      if (options.sort) result.sort = options.sort;
      if (options.limit) result.limit = options.limit;
      if (options.skip) result.skip = options.skip;
    }
  
    return JSON.stringify(result);
  }
  // const postgresQuery = `db.products.aggregate([ { $match: { avg_price: { $gt: 100 } } }, { $group: { _id: "$category", avg_price: { $avg: "$price" } } }, { $sort: { avg_price: -1 } } ], { sort: { total: -1 }, limit: 5 })`;
  // console.log((mongoToJson(postgresQuery)))
  module.exports = mongoToJson;