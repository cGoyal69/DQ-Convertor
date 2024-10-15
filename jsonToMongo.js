function jsonToMongo(Json) {
    const json = JSON.parse(Json);
    let queryString = `db.${json.collection}.`;
    const args = [];

    // Handle insert operations
    if (json.operation === 'insert' || json.operation === 'insertOne') {
        if (Array.isArray(json.documents) && json.documents.length === 1) {
            queryString += 'insertOne(';
            args.push(json.documents[0]); // Insert one document
        } else {
            queryString += 'insertMany(';
            args.push(json.documents); // Insert multiple documents
        }
    } 
    else if (json.operation === 'insertMany') {
        queryString += 'insertMany(';
        args.push(json.documents); // Insert multiple documents
    } 
    // Handle update operations (unchanged)
    else if (json.operation === 'update' || json.operation === 'updateOne') {
        queryString += 'updateMany(';
        args.push(json.filter, json.update);
    } 
    else if (json.operation === 'updateMany') {
        queryString += 'updateMany(';
        args.push(json.filter, json.update);
    } 
    // Handle delete operations (unchanged)
    else if (json.operation === 'delete' || json.operation === 'deleteOne') {
        queryString += 'deleteMany(';
        args.push(json.filter);
    } 
    else if (json.operation === 'deleteMany') {
        queryString += 'deleteMany(';
        args.push(json.filter);
    } 
    // Handle other operations
    else {
        switch (json.operation) {
            case 'find':
            case 'findOne':
                queryString += json.operation + '(';
                args.push(json.filter || {});
                if (json.projection) args.push(json.projection);
                break;
            case 'aggregate':
                queryString += 'aggregate(';
                args.push(json.pipeline);
                break;
            case 'create':
                queryString += 'insertOne('; // Assuming create means insert one
                args.push(json.document);
                break;
            case 'createMany':
                queryString += 'insertMany('; // Assuming createMany means insert many
                args.push(json.documents);
                break;
            default:
                throw new Error(`Unsupported operation: ${json.operation}`);
        }
    }

    queryString += args.map(arg => stringifyArg(arg)).join(', ');
    queryString += ')';

    // Optional chaining for limit and sort
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

// Example usage
const examples = [
    `{"operation":"insert","collection":"products","documents":[{"name":"product1","price":120,"category":"electronics"}]}`,
    `{"collection":"collection","operation":"insert","documents":[{"city":"New York"}, {"city":"Los Angeles"}]}`,
    `{"collection":"collection","operation":"update","filter":{"city":"New York"},"update":{"$set":{"city":"San Francisco"}}}`,
    `{"collection":"collection","operation":"delete","filter":{"city":"San Francisco"}}`
];

examples.forEach(example => {
    console.log(jsonToMongo(example));
});

module.exports = jsonToMongo;
