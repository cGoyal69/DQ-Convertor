const originalString = '[10]';

// Replace keys without quotes and then single quotes with double quotes
let validJsonString = originalString
    .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // Wrap keys in double quotes
    .replace(/'/g, '"'); // Replace single quotes with double quotes


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
console.log(string[0])