

function xqueryToXml(xquery) {
  const lines = xquery.split('\n').filter(line => line.trim().startsWith('let $'));
  const variables = {};

  lines.forEach(line => {
    const match = line.match(/let \$(\w+) := element (\w+) { (.*) }/);
    if (match) {
      const [_, varName, elementName, content] = match;
      variables[varName] = { elementName, content };
    }
  });

  function buildXml(varName) {
    const { elementName, content } = variables[varName];
    let xml = `<${elementName}`;
    
    const attrMatches = content.match(/attribute (\w+) { "([^"]*)" }/g) || [];
    attrMatches.forEach(attrMatch => {
      const [_, name, value] = attrMatch.match(/attribute (\w+) { "([^"]*)" }/);
      xml += ` ${name}="${value}"`;
    });

    xml += '>';

    const childContent = content.replace(/attribute \w+ { "[^"]*" },?\s*/g, '').trim();
    if (childContent.startsWith('"') && childContent.endsWith('"')) {
      xml += childContent.slice(1, -1); 
    } else {
      const childVarMatches = childContent.match(/\$\w+/g) || [];
      childVarMatches.forEach(childVar => {
        xml += buildXml(childVar.slice(1)); 
      });
    }

    xml += `</${elementName}>`;
    return xml;
  }

  return buildXml('root');
}
module.exports = xqueryToXml;
/*
console.log(xqueryToXml(`xquery version "3.1";
        let $root := element root { $root_collection, $root_operation, $root_pipeline, $root_sort, $root_limit }
let $root_collection := element collection { "products" }
let $root_operation := element operation { "aggregate" }
let $root_pipeline := element pipeline { $root_pipeline__dollar_match, $root_pipeline__dollar_group, $root_pipeline__dollar_sort }
let $root_pipeline__dollar_match := element _dollar_match { $root_pipeline__dollar_match_avg_price }
let $root_pipeline__dollar_match_avg_price := element avg_price { $root_pipeline__dollar_match_avg_price__dollar_gt }
let $root_pipeline__dollar_match_avg_price__dollar_gt := element _dollar_gt { "100" }
let $root_pipeline__dollar_group := element _dollar_group { $root_pipeline__dollar_group__id, $root_pipeline__dollar_group_avg_price }
let $root_pipeline__dollar_group__id := element _id { "$category" }
let $root_pipeline__dollar_group_avg_price := element avg_price { $root_pipeline__dollar_group_avg_price__dollar_avg }
let $root_pipeline__dollar_group_avg_price__dollar_avg := element _dollar_avg { "$price" }
let $root_pipeline__dollar_sort := element _dollar_sort { $root_pipeline__dollar_sort_avg_price }
let $root_pipeline__dollar_sort_avg_price := element avg_price { "-1" }
let $root_sort := element sort { $root_sort_total }
let $root_sort_total := element total { "-1" }
let $root_limit := element limit { "5" }

    return $root`))
  */