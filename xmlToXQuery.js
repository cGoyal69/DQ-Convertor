const { DOMParser } = require('xmldom');

class XmlParser {
  static parse(xmlString) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "text/xml");

      const parseError = xmlDoc.getElementsByTagName("parsererror");
      if (parseError.length > 0) {
        throw new Error("XML parsing failed: " + parseError[0].textContent);
      }

      return this.nodeToObject(xmlDoc.documentElement);
    } catch (error) {
      throw new Error(`XML parsing error: ${error.message}`);
    }
  }

  static nodeToObject(node) {
    const obj = {
      nodeName: node.nodeName,
      nodeType: node.nodeType,
    };

    // Handle namespaces
    if (node.namespaceURI) {
      obj.namespace = {
        uri: node.namespaceURI,
        prefix: node.prefix || null
      };
    }

    // Handle attributes
    if (node.attributes && node.attributes.length > 0) {
      obj.attributes = {};
      for (let i = 0; i < node.attributes.length; i++) {
        const attr = node.attributes[i];
        const attrName = attr.name;
        const attrValue = attr.value;

        if (attrName.startsWith('xmlns:')) {
          if (!obj.namespaces) obj.namespaces = {};
          obj.namespaces[attrName.split(':')[1]] = attrValue;
        } else {
          obj.attributes[attrName] = attrValue;
        }
      }
    }

    // Handle child nodes
    const childNodes = [];
    let hasTextContent = false;
    let textContent = '';

    for (let i = 0; i < node.childNodes.length; i++) {
      const childNode = node.childNodes[i];
      switch (childNode.nodeType) {
        case 1: // ELEMENT_NODE
          childNodes.push(this.nodeToObject(childNode));
          break;

        case 3: // TEXT_NODE
          const text = childNode.nodeValue.trim();
          if (text) {
            hasTextContent = true;
            textContent += childNode.nodeValue;
          }
          break;

        case 4: // CDATA_SECTION_NODE
          hasTextContent = true;
          textContent += childNode.nodeValue;
          obj.hasCDATA = true;
          break;

        case 8: // COMMENT_NODE
          childNodes.push({
            nodeType: 8, // COMMENT_NODE
            content: childNode.nodeValue
          });
          break;

        case 7: // PROCESSING_INSTRUCTION_NODE
          childNodes.push({
            nodeType: 7, // PROCESSING_INSTRUCTION_NODE
            target: childNode.target,
            data: childNode.data
          });
          break;
      }
    }

    if (hasTextContent) {
      obj.textContent = textContent;
    }

    if (childNodes.length > 0) {
      obj.childNodes = childNodes;
    }

    return obj;
  }
}

class XmlToXQueryConverter {
  constructor(options = {}) {
    this.options = {
      indentSize: 2,
      documentName: 'input.xml',
      generateComments: true,
      handleNamespaces: true,
      ...options
    };
    this.variableCounter = 0;
    this.namespaces = new Map();
    this.xqueryParts = {
      namespaces: new Set(),
      letBindings: [],
      returnExpressions: []
    };
    this.indentLevel = 0;
  }

  convert(xmlString) {
    try {
      const xmlObj = XmlParser.parse(xmlString);
      this.collectNamespaces(xmlObj);
      this.processXmlObject(xmlObj);
      return this.generateXQuery();
    } catch (error) {
      throw new Error(`Failed to convert XML to XQuery: ${error.message}`);
    }
  }

  collectNamespaces(obj) {
    if (obj.namespace) {
      this.namespaces.set(obj.namespace.prefix || '', obj.namespace.uri);
    }
    if (obj.namespaces) {
      Object.entries(obj.namespaces).forEach(([prefix, uri]) => {
        this.namespaces.set(prefix, uri);
      });
    }
    if (obj.childNodes) {
      obj.childNodes.forEach(child => this.collectNamespaces(child));
    }
  }

  processXmlObject(obj, parentVar = null, isRoot = true) {
    const currentVar = this.generateVariableName(obj.nodeName);
    const parentVarName = parentVar ? `$${parentVar}` : `$doc`;
    const currentPath = isRoot ? `$doc/${this.getQualifiedName(obj)}` : `${parentVarName}/${this.getQualifiedName(obj)}`;

    // Add let binding for current node
    this.xqueryParts.letBindings.push(
      `let $${currentVar} := ${currentPath}`
    );

    // Handle attributes
    if (obj.attributes) {
      Object.entries(obj.attributes).forEach(([attrName, attrValue]) => {
        const attrVar = this.generateVariableName(`${currentVar}_${attrName}`);
        this.xqueryParts.letBindings.push(
          `let $${attrVar} := $${currentVar}/@${attrName}`
        );
      });
    }

    // Handle text content
    if (obj.textContent) {
      const textVar = this.generateVariableName(`${currentVar}_text`);
      this.xqueryParts.letBindings.push(
        `let $${textVar} := ${obj.hasCDATA ? 'data' : 'normalize-space'}($${currentVar})`
      );
    }

    // Handle child nodes
    if (obj.childNodes) {
      const elementNodes = obj.childNodes.filter(child => child.nodeType === 1);
      const groupedNodes = this.groupNodesByName(elementNodes);

      for (const [nodeName, nodes] of Object.entries(groupedNodes)) {
        if (nodes.length > 1) {
          // Multiple nodes with the same name, use a for loop
          const childVar = this.generateVariableName(nodeName);
          this.xqueryParts.letBindings.push(
            `for $${childVar} in $${currentVar}/${this.getQualifiedName(nodes[0])}`
          );
          nodes.forEach(node => {
            this.processXmlObject(node, childVar, false);
          });
        } else {
          // Single node
          nodes.forEach(node => {
            this.processXmlObject(node, currentVar, false);
          });
        }
      }
    }
  }

  groupNodesByName(nodes) {
    const groups = {};
    nodes.forEach(node => {
      if (!groups[node.nodeName]) {
        groups[node.nodeName] = [];
      }
      groups[node.nodeName].push(node);
    });
    return groups;
  }

  getQualifiedName(obj) {
    if (obj.namespace && obj.namespace.prefix) {
      return `${obj.namespace.prefix}:${obj.nodeName}`;
    }
    return obj.nodeName;
  }

  generateVariableName(base) {
    this.variableCounter++;
    return `${base}_${this.variableCounter}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  generateXQuery() {
    const parts = [];

    // Version declaration
    parts.push('xquery version "3.1";');

    if (this.options.generateComments) {
      parts.push('(: Generated XQuery expression :)');
    }

    // Namespace declarations
    this.namespaces.forEach((uri, prefix) => {
      if (prefix) {
        parts.push(`declare namespace ${prefix} = "${uri}";`);
      } else {
        parts.push(`declare default element namespace "${uri}";`);
      }
    });

    // Document declaration
    parts.push(`let $doc := doc("${this.options.documentName}")`);

    // Add let bindings
    if (this.xqueryParts.letBindings.length > 0) {
      parts.push(this.xqueryParts.letBindings.join('\n'));
    }

    // Return clause
    parts.push('return');
    parts.push(this.generateReturnClause());

    return parts.join('\n\n');
  }

  generateReturnClause() {
    // For simplicity, return the root variable
    return '  $doc';
  }
}

// Test function with various XML scenarios
function runTests() {
  const testCases = [
    {
      name: "Mixed Content",
      xml: ` <root xmlns="http://default.namespace.com" xmlns:custom="http://custom.namespace.com">
                    <element>Default namespace</element>
                    <custom:element>Custom namespace</custom:element>
                </root>`
    }
  ];

  testCases.forEach(testCase => {
    console.log(`Test Case: ${testCase.name}`);
    console.log('Input XML:', testCase.xml);

    const converter = new XmlToXQueryConverter();
    const xquery = converter.convert(testCase.xml);

    console.log('Generated XQuery:', xquery);
    console.log('------------------------');
  });
}

runTests();
