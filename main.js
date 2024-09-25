function mongoTokens(query) {
    let bracket = ['1'], h = [], p = "", isString = false, prev = ' ';
    for(let i = 0; i < query.length; i++) {
        if (query[i] == ' ' && !isString)
            continue;
        else {
            if (bracket[bracket.length-1] != '(' || query[i] == '.') {
                if (query[i] == '(' || query[i] == '.') {
                    if (query[i] == '(')
                        bracket.push('(');
                    if (p.length != 0)
                        h.push(p);
                    p = "";
                } else {
                    p += query[i];
                }
            } else if(query[i] == '\'' || query[i] == '"') {
                if (query[i] == prev) {
                    prev = ' ';
                    isString = false;
                    p += query[i];
                } else if (prev == ' ') {
                    isString = true;
                    prev = query[i];
                    p += query[i];
                }
            } else if(!isString) {
                if (query[i] == '(')
                    bracket.push('(');
                if(query[i] == ')') {
                    bracket.pop();
                    if (bracket[bracket.length-1] == '(')
                        p += ")";
                    if(p.length != 0 && bracket[bracket.length-1] == '1') {
                        h.push(p);
                        p = "";
                    }
                } else {
                    p += query[i];
                }
            } else {
                p += query[i];
            }
        }
    }
    return h;
}

function parseCondition(field, condition) {
    const result = [];
    if (typeof condition === 'object' && !Array.isArray(condition)) {
        // Handle conditions like { "$gte": 18 }
        Object.keys(condition).forEach(operator => {
            result.push({
                field: field,
                operator: operator,
                value: condition[operator]
            });
        });
    } else {
        // Handle conditions like { age: 18 }
        result.push({
            field: field,
            operator: '=',
            value: condition
        });
    }
    return result;
}
const tokens = mongoTokens('db.employees.updateMany({ $and: [ { $or: [ { department: "HR" }, { salary: { $lt: 40000 } } ] }, { yearsOfExperience: { $gte: 3 } }, { "performance.rating": { $gte: 4 } } ] }, { $set: { department: "Admin", "status.active": true, lastPromoted: new Date() }, $inc: { salary: 5000, bonus: 1000 }, $push: { feedback: { $each: [ { comment: "Great performance", date: new Date() }, { comment: "Exceeded expectations", date: new Date() } ], $slice: -5 } }, $addToSet: { skills: { $each: ["Leadership", "Management"] } }, $unset: { probationPeriod: "" }, $rename: { "oldFieldName": "newFieldName" } }, { upsert: false, multi: true })');
console.log(tokens[3])
console.log(tokens[3][0])
if (tokens[3][0] != "[")
    tokens[3] = "["+tokens[3]+"]"
console.log(tokens[3])
function convertToJsonFormat(queryString) {
    return queryString
        // Replace MongoDB-style keys (without quotes) with quoted keys
        .replace(/\$([a-zA-Z_]+)/g, '"$&"') // Wrap operators like $and in quotes
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":') // Wrap unquoted keys in quotes
        .replace(/'/g, '"'); // Replace single quotes with double quotes
}

// Convert and log the result
const validJsonString = convertToJsonFormat(tokens[3]);
console.log(validJsonString);
function stringToObject(validJsonString) {
    try {
        const jsonObject = JSON.parse(validJsonString);
        return jsonObject;
    } catch (error) {
        console.error(`JSON parsing error: ${error.message}`);
        return null; // Return null if there's an error
    }
}


console.log( Object.keys(tokens).length)
if (tokens[2] == "find"){
    function extractFilterAndProjection(findQuery) {
        // Assuming the findQuery is a two-parameter array: [filter, projection]
        const [filter] = findQuery;
        // Returning the filter and projection objects
        return {
        filter: filter[0] || {},       // If no filter is provided, return an empty object
        projection: filter[1] || {}  // If no projection is provided, return an empty object
        };
    }
}
else if (tokens[2] == "insertOne" || tokens[2] == "insertMany")
{
    function extractFilterAndProjection(findQuery) {
        // Assuming the findQuery is a two-parameter array: [filter, projection]
        const [filter] = findQuery;
        // Returning the filter and projection objects
        return {
        filter: filter[0] || {},       // If no filter is provided, return an empty object 
        };
    }
}
else if (tokens[2] == "updateOne" || tokens[2] == "updateMany")
{
    function extractFilterAndProjection(findQuery) 
    {
        // Assuming the findQuery is a two-parameter array: [filter, projection]
        const [filter] = findQuery;
        // Returning the filter and projection objects
        return {
        filter: filter[0] || {},
        set : filter[1] || {},
        upsert : filter[2] || {} 
        };
    }
}
else if (tokens[2] == "deleteOne" || tokens[2] == "deleteMany")
{
    function extractFilterAndProjection(findQuery) 
    {
        // Assuming the findQuery is a two-parameter array: [filter, projection]
        const [filter] = findQuery;
        // Returning the filter and projection objects
        return {
        filter: filter[0] || {},
        };
    }
}

let string = stringToObject(validJsonString);
console.log(string);

let findQuery = [string];
const result = extractFilterAndProjection(findQuery);
const conditions = result.filter;
const projection = result.projection;
console.log(result);
