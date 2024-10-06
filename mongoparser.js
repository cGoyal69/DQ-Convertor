function parseMongoQuery(queryString) {
    // Regular expression to match all MongoDB query types
    const mongoPattern = /db\.(\w+)\.(find|findOne|insert|insertOne|insertMany|update|updateOne|updateMany|delete|deleteOne|deleteMany|aggregate|count|countDocuments|distinct|createIndex|dropIndex|drop|bulkWrite|watch|mapReduce)\(([\s\S]*?)\)(\.(?:sort|limit|skip|project|explain|toArray|forEach|map|hasNext|next|count|size|pretty)\([\s\S]*?\))*/;
    const match = queryString.match(mongoPattern);
  
    if (!match) {
      throw new Error("Invalid MongoDB query format");
    }
  
    const collection = match[1]; // Extract the collection name
    const operation = match[2];  // Extract the operation (find, insert, update, etc.)
    const queryParams = match[3]; // Extract the parameters inside the operation
    const chainedOperations = match[4] || ''; // Extract chained methods like .limit(), .sort()
  
    let parsedParams = {};
    try {
      parsedParams = eval(`(${queryParams})`); // Safely parse the parameters as an object
    } catch (error) {
      throw new Error("Error parsing query parameters");
    }
  
    // Structure the final parsed query object
    let parsedQuery = {
      collection: collection,
      operation: operation,
      query: parsedParams
    };
  
    // Handle chained operations like limit, sort, skip, etc.
    const chainedPattern = /\.([a-zA-Z_][\w]*)\(([^)]*)\)/g;
    let chainedMatch;
  
    while ((chainedMatch = chainedPattern.exec(chainedOperations)) !== null) {
      const method = chainedMatch[1];
      let args;
  
      try {
        // Safely parse the arguments of the chained method
        args = eval(`(${chainedMatch[2]})`);
      } catch (error) {
        throw new Error(`Error parsing arguments for method ${method}: ${error.message}`);
      }
  
      // Add method and its arguments to parsedQuery
      parsedQuery[method] = args;
    }
  
    return parsedQuery;
}
module.exports = parseMongoQuery;
// Example MongoDB query strings
// const mongoQueryString1 = `db.users.find({ name: { $eq: "John" }, age: { $gt: 25 } }, { name: 1, age: 1 }).limit(10).sort({ age: -1 })`;
// const mongoQueryString2 = `db.users.insert({
//     name: "John Doe",
//     age: 30,
//     email: "johndoe@example.com",
//     address: {
//       street: "123 Main St",
//       city: "Anytown",
//       state: "CA",
//       zip: "12345"
//     },
//     interests: ["music", "sports", "travel"]
//   });`;
//   const mongoQueryString3 = `db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }]).limit(5).sort({ total: -1 })`;
  
//   // Parsing the queries
//   try {
//     const parsedQuery1 = parseMongoQuery(mongoQueryString1);
//     const parsedQuery2 = parseMongoQuery(mongoQueryString2);
//     const parsedQuery3 = parseMongoQuery(mongoQueryString3);
  
//     // Output the results
//     console.log(parsedQuery1);
//     console.log(parsedQuery2);
//     console.log(parsedQuery3);
//   } catch (error) {
//     console.error(error.message);
//   }
