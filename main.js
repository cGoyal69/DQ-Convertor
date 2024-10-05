function mongoTokens(query) {
    let bracket = ['1'], h = [], p = "", isString = false, prev = ' ';
    for (let i = 0; i < query.length; i++) {
        if (query[i] == '\'' || query[i] == '"') {
            if (query[i] == prev) {
                prev = ' ';
                isString = false;
                p += query[i];
            } else if (prev == ' ') {
                isString = true;
                prev = query[i];
                p += query[i];
            }
        } else if (isString) {
            p += query[i];
        } else {
            if (bracket[bracket.length - 1] != '(' || query[i] == '.') {
                if (query[i] == '(' || query[i] == '.') {
                    if (query[i] == '(') bracket.push('(');
                    if (p.length != 0) h.push(p);
                    p = "";
                } else {
                    p += query[i];
                }
            } else {
                if (query[i] == '(') bracket.push('(');
                if (query[i] == ')') {
                    bracket.pop();
                    if (bracket[bracket.length - 1] == '(') p += ")";
                    if (p.length != 0 && bracket[bracket.length - 1] == '1') {
                        h.push(p);
                        p = "";
                    }
                } else {
                    p += query[i];
                }
            }
        }
    }
    return h;
}

function toStringi(token) {
    return "[" + token + "]";
}

function stringToObject(str) {
    const validJsonString = str
        .replace(/([{,]\s*)([\$]*\w+)(\s*:)/g, '$1"$2"$3') // Wrap keys in double quotes
        .replace(/'/g, '"'); // Replace single quotes with double quotes

    try {
        return JSON.parse(validJsonString);
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}

function extractFilterAndProjectionFromFind(findQuery) {
    const [filter, projection] = findQuery;
    return {
        filter: filter || {},
        projection: projection || {}
    };
}

function extractFilterAndProjectionFromInsert(findQuery) {
    return {
        documents: findQuery || []
    };
}

function extractFilterAndProjectionUpdate(findQuery) {
    const [filter, update, options] = findQuery;
    return {
        filter: filter || {},
        update: update || {},
        options: options || {}
    };
}

function extractPipelineFromAggregate(aggregateQuery) {
    return {
        pipeline: aggregateQuery || []
    };
}

// Main function to parse the MongoDB query
function parseMongoQuery(query) {
    const tokens = mongoTokens(query);
    const operation = tokens[2];

    if (operation === "find") {
        const token = toStringi(tokens[3]);
        const validString = stringToObject(token);
        const result = extractFilterAndProjectionFromFind(validString);
        console.log("Find Result:", result);
    } else if (operation === "insertOne" || operation === "insertMany") {
        const token = toStringi(tokens[3]);
        const validString = stringToObject(token);
        const result = extractFilterAndProjectionFromInsert(validString);
        console.log("Insert Result:", result);
    } else if (operation === "updateOne" || operation === "updateMany") {
        const token = toStringi(tokens[3]);
        const validString = stringToObject(token);
        const result = extractFilterAndProjectionUpdate(validString);
        console.log("Update Result:", result);
    } else if (operation === "deleteOne" || operation === "deleteMany") {
        const token = toStringi(tokens[3]);
        const validString = stringToObject(token);
        const result = extractFilterAndProjectionFromFind(validString);
        console.log("Delete Result:", result);
    } else if (operation === "aggregate") {
        const token = toStringi(tokens[3]);
        const validString = stringToObject(token);
        const result = extractPipelineFromAggregate(validString);
        console.log("Aggregate Result:", result);
    } else {
        console.log("Unsupported operation");
    }
}

// Sample MongoDB queries
const mongoFindQuery = `db.employees.find({ age: { $gte: 25 } }, { name: 1, age: 1 })`;
const mongoInsertQuery = `db.employees.insertMany([{ name: "Alice", age: 24 }, { name: "Bob", age: 30 }])`;
const mongoUpdateQuery = `db.employees.updateOne({ name: "Alice" }, { $set: { age: 25 } })`;
const mongoDeleteQuery = `db.employees.deleteMany({ age: { $lt: 20 } })`;
const mongoAggregateQuery = `db.employees.aggregate([{ $match: { department: "HR" } }, { $group: { _id: "$age", count: { $sum: 1 } } }])`;

// Parsing the queries
parseMongoQuery(mongoFindQuery);
parseMongoQuery(mongoInsertQuery);
parseMongoQuery(mongoUpdateQuery);
parseMongoQuery(mongoDeleteQuery);
parseMongoQuery(mongoAggregateQuery);