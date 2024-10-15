function jsonToMongo(Json) {
    const json = JSON.parse(Json);
    let queryString = `db.${json.collection}.${json.operation}(`;
    const args = [];

    switch (json.operation) {
        case 'find':
        case 'findOne':
            args.push(json.filter || {});
            if (json.projection) args.push(json.projection);
            break;
        case 'insert':
        case 'insertOne':
            args.push(json.documents[0]); // Only insert one document
            break;
        case 'insertMany':
            args.push(json.documents); // Insert multiple documents
            break;
        case 'update':
        case 'updateOne':
            args.push(json.filter, json.update);
            break;
            
        case 'updateMany':
            args.push(json.filter, json.update);
            break;
        case 'delete':
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
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
        return `{ ${Object.keys(arg).map(key => `${key}: ${stringifyArg(arg[key])}`).join(', ')} }`;
    } else if (Array.isArray(arg)) {
        return `[ ${arg.map(item => stringifyArg(item)).join(', ')} ]`;
    } else {
        return JSON.stringify(arg);
    }
}

// Example input for update operation
const examples = [
    `{"collection":"collection","operation":"updateMany","filter":{"city":"New York"},"update":{"$set":{"city":"San Francisco"}}}`
];

// Test each example
examples.forEach(example => {
    console.log(jsonToMongo(example));
});

module.exports = jsonToMongo;
