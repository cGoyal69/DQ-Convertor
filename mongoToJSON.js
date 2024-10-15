function mongoToJSON(queryString) {
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

    let parsedParams = [];
    try {
        // Safely parse the parameters as an array
        parsedParams = eval(`[${queryParams}]`);
    } catch (error) {
        throw new Error("Error parsing query parameters");
    }

    // Structure the final parsed query object
    let parsedQuery = {
        collection: collection,
        operation: operation,
    };

    // Distinguish between filter and projection for find operations
    if (operation === 'find' || operation === 'findOne') {
        parsedQuery.filter = parsedParams[0] || {}; // First argument is filter
        parsedQuery.projection = parsedParams[1] || {}; // Second argument is projection
    } else if (operation === 'insert' || operation === 'insertOne' || operation === 'insertMany') {
        parsedQuery.documents = parsedParams[0];
    } else if (operation === 'update' || operation === 'updateOne' || operation === 'updateMany') {
        parsedQuery.filter = parsedParams[0];
        parsedQuery.update = parsedParams[1];
    } else if (operation === 'delete' || operation === 'deleteOne' || operation === 'deleteMany') {
        parsedQuery.filter = parsedParams[0];
    } else if (operation === 'aggregate') {
        parsedQuery.pipeline = parsedParams[0];
    }

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
        switch (method) {
            case 'limit':
                parsedQuery.limit = args; // Convert limit to integer
                break;
            case 'sort':
                parsedQuery.sort = args;
                break;
            case 'skip':
                parsedQuery.skip = parseInt(args, 10); // Convert skip to integer
                break;
            case 'project':
                parsedQuery.projection = args;
                break;
            case 'explain':
                parsedQuery.explain = true;
                break;
            case 'toArray':
                parsedQuery.toArray = true;
                break;
            case 'forEach':
                parsedQuery.forEach = args;
                break;
            case 'map':
                parsedQuery.map = args;
                break;
            case 'hasNext':
                parsedQuery.hasNext = true;
                break;
            case 'next':
                parsedQuery.next = true;
                break;
            case 'count':
                parsedQuery.count = true;
                break;
            case 'size':
                parsedQuery.size = true;
                break;
            case 'pretty':
                parsedQuery.pretty = true;
                break;
            default:
                throw new Error(`Unsupported chained method: ${method}`);
        }
    }

    return parsedQuery;
}

module.exports = mongoToJSON;

// Example MongoDB query strings
const mongoQueryString1 = `db.users.find({ name: { $eq: "John" }, age: { $gt:  25 } }, { name: 1, age: 1 }).limit(10).sort({ age: -1 })`;
const mongoQueryString2 = `db.users.insertOne({ name: "John Doe", age: 30, email: "johndoe@example.com" })`;
const mongoQueryString3 = `db.users.updateOne({ name: "John Doe" }, { $set: { age: 31 } })`;
const mongoQueryString4 = `db.orders.aggregate([{ $match: { status: "completed" } }, { $group: { _id: "$customerId", total: { $sum: "$amount" } } }]).limit(5).sort({ total: -1 })`;

// Parsing the queries
try {
    const parsedQuery1 = mongoToJSON(mongoQueryString1);
    console.log(JSON.stringify(parsedQuery1, null, 2));

    const parsedQuery2 = mongoToJSON(mongoQueryString2);
    console.log(JSON.stringify(parsedQuery2, null, 2));

    const parsedQuery3 = mongoToJSON(mongoQueryString3);
    console.log(JSON.stringify(parsedQuery3, null, 2));

    const parsedQuery4 = mongoToJSON(mongoQueryString4);
    console.log(JSON.stringify(parsedQuery4, null, 2));
} catch (error) {
    console.error(error.message);
}