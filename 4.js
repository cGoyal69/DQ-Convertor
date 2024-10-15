function jsonToMongo(json) {
    let queryString = `db.${json.collection}.${json.operation}(`;
    const args = [];

    switch (json.operation) {
        case 'find':
        case 'findOne':
            args.push(json.filter || {});
            if (json.projection) args.push(json.projection);
            break;
        case 'insertOne':
            args.push(json.documents[0]); // Only insert one document
            break;
        case 'insertMany':
            args.push(json.documents); // Insert multiple documents
            break;
        case 'updateOne':
            args.push(json.filter, json.update);
            break;
        case 'updateMany':
            args.push(json.filter, json.update);
            break;
        case 'deleteOne':
            args.push(json.filter);
            break;
        case 'deleteMany':
            args.push(json.filter);
            break;
        case 'aggregate':
            args.push(json.pipeline);
            break;
        case 'create':
            args.push(json.document); // For creating a single document
            break;
        case 'createMany':
            args.push(json.documents); // For creating multiple documents
            break;
        default:
            throw new Error(`Unsupported operation: ${json.operation}`);
    }

    queryString += args.map(arg => stringifyArg(arg)).join(', ');
    queryString += ')';

    if (json.limit !== undefined) {
        queryString += `.limit(${json.limit})`;
    }
    
    if (json.sort !== undefined) {
        queryString += `.sort(${stringifyArg(json.sort)})`;
    }

    return queryString;
}

// Custom function to stringify arguments
function stringifyArg(arg) {
    if (typeof arg === 'object' && !Array.isArray(arg)) {
        return `{ ${Object.keys(arg).map(key => `${key}: ${stringifyArg(arg[key])}`).join(', ')} }`;
    } else if (Array.isArray(arg)) {
        return `[ ${arg.map(item => stringifyArg(item)).join(', ')} ]`;
    } else {
        return JSON.stringify(arg);
    }
}

// Example inputs for various operations
const examples = [
    {
        operation: "insertMany",
        collection: "users",
        documents: [{ name: "John", age: 30 }, { name: "Jane", age: 25 }]
    },
    {
        operation: "find",
        collection: "users",
        filter: { age: { $gt: 20 } },
        projection: { name: 1, age: 1 },
        limit: 10,
        sort: { age: 1 }
    },
    {
        operation: "updateMany",
        collection: "users",
        filter: { age: { $lt: 30 } },
        update: { $set: { status: "active" } }
    },
    {
        operation: "deleteMany",
        collection: "users",
        filter: { age: { $lt: 20 } }
    },
    {
        operation: "aggregate",
        collection: "products",
        pipeline: [
            { $match: { avg_price: { $gt: 100 } } },
            { $group: { _id: "$category", avg_price: { $avg: "$price" } } }
        ]
    }
];

// Test each example
examples.forEach(example => {
    console.log(jsonToMongo(example));
});

module.exports = jsonToMongo;
