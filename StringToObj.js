const originalString = '[{ $and: [{ age: { $gte: 25 } }, { salary: { $gt: 50000 } }, { department: { $in: ["Engineering", "Marketing"] } }, { status: "active" }, { hobbies: { $elemMatch: { $in: ["hiking", "gaming"] } } }] }, { name: 1, age: 1, department: 1, salary: 1, _id: 0 }]'
     // Query filter to select all documents
     // Projection: include name and age, exclude _id


// Replace keys without quotes and then single quotes with double quotes
let validJsonString = originalString
    .replace(/([{,]\s*)([\$]*\w+)(\s*:)/g, '$1"$2"$3')// Wrap keys in double quotes
    .replace(/'/g, '"'); // Replace single quotes with double quotes

console.log(validJsonString)
function stringToObject(validJsonString)
{
    try {
        const jsonObject = JSON.parse(validJsonString);
        return jsonObject;
    } catch (error) {
        return error;
    }
}
let string = stringToObject(validJsonString)
console.log(string)