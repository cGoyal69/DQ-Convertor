function mongoTokens(query) {
    let bracket = ['1'], h = [], p = "", isString = false, prev = ' ';
    for(let i = 0; i < query.length; i++) {
        if(query[i] == '\'' || query[i] == '"') 
        {
            if (query[i] == prev) {
                prev = ' ';
                isString = false;
                p += query[i];
            } else if (prev == ' ') {
                isString = true;
                prev = query[i];
                p += query[i];
            }
        } 
        else if (isString)
            p+=query[i];
        else if (!isString){
            if (bracket[bracket.length-1] != '(' || query[i] == '.') {
                if (query[i] == '(' || query[i] == '.') {
                    if (query[i] == '(')
                        bracket.push('(');
                    if (p.length != 0)
                        h.push(p);
                    p = "";
                } 
                else 
                    p += query[i];
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
                } else 
                    p += query[i];
            } else 
                p += query[i];
        }
    }
    return h;
}

const tokens = mongoTokens('db.employees.find({ $and: [{ age: { $gte: 25 } }, { salary: { $gt: 50000 } }, { department: { $in: ["Engineering", "Marketing"] } }, { status: "active" }, { hobbies: { $elemMatch: { $in: ["hiking", "gaming"] } } }] }, { name: 1, age: 1, department: 1, salary: 1, _id: 0 })');

function toStringi(token)
{
    token = "["+token+"]"
    return token
}
function stringToObject(str) {
    // Replace keys without quotes and then single quotes with double quotes
    const validJsonString = str
        .replace(/([{,]\s*)([\$]*\w+)(\s*:)/g, '$1"$2"$3')// Wrap keys in double quotes
        .replace(/'/g, '"'); // Replace single quotes with double quotes
      
    try {
        const jsonObject = JSON.parse(validJsonString);
        return jsonObject;
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}


function extractFilterAndProjectionFromFind(findQuery) {
    // Assuming the findQuery is a two-parameter array: [filter, projection]
    const [filter, projection] = findQuery;
  
    // Returning the filter and projection objects
    return {
      filter: filter || {},       // If no filter is provided, return an empty object
      projection: projection || {}  // If no projection is provided, return an empty object
    };
  }
  function extractFilterAndProjectionFromInsertDelete(findQuery) {
    // Assuming the findQuery is a two-parameter array: [filter, projection]
    const [filter, projection] = findQuery;
  
    // Returning the filter and projection objects
    return {
      filter: filter || {},       // If no filter is provided, return an empty object 
    };
  }

function extractFilterAndProjectionUpdate(findQuery) {
    // Assuming the findQuery is a two-parameter array: [filter, projection]
    const [filter] = findQuery;
    // Returning the filter and projection objects
    return {
        filter: filter[0] || {},
        set : filter[1] || {},
        upsert : filter[2] || {} 
    };
}
if (tokens[2] == "find"){
    console.log(tokens[3])
    const token =  toStringi(tokens[3])
    console.log(token)
    const validString = stringToObject(token)
    console.log(validString)
    const result = extractFilterAndProjectionFromFind(validString)

}
else if (tokens[2] == "insertOne" || tokens[2] == "insertMany"){
    const token =  toStringi(tokens[3])
    const validString = stringToObject(token)
    const result = extractFilterAndProjectionFromInsertDelete(validString)
    console.log(result)

}
else if (tokens[2] == "updateOne" || tokens[2] == "updateMany"){
    
}
else if (tokens[2] == "deleteOne" || tokens[2] == "deleteMany"){
    console.log("1")
    console.log(tokens[3])
    const token =  toStringi(tokens[3])
    console.log(token)
    const validString = stringToObject(token)
    console.log(validString)
    const result = extractFilterAndProjectionFromFind(validString)
    console.log(result)
}
console.log(tokens)


//let string = stringToObject(validJsonString);
//console.log(string);
//let findQuery = [string];
//const result = extractFilterAndProjection(findQuery);
//const conditions = result.filter;
//const projection = result.projection;
//console.log(result);
