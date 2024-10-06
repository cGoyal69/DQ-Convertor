const { DOMImplementation, XMLSerializer } = require('xmldom');

class XQueryParser {
    static parse(xquery) {
        const doc = new DOMImplementation().createDocument(null, null, null);
        const rootElement = doc.createElement('XQuery');

        // Basic structure parsing
        const lines = xquery.split('\n').filter(line => line.trim());
        lines.forEach(line => {
            this.processLine(line.trim(), rootElement, doc);
        });

        doc.appendChild(rootElement);
        return new XMLSerializer().serializeToString(doc);
    }

    static processLine(line, parentElement, doc) {
        if (line.startsWith('xquery version')) {
            return this.processXQueryVersion(line, parentElement, doc);
        } else if (line.startsWith('let')) {
            return this.processLet(line, parentElement, doc);
        } else if (line.startsWith('for')) {
            return this.processFor(line, parentElement, doc);
        } else if (line.startsWith('if')) {
            return this.processIf(line, parentElement, doc);
        } else if (line.startsWith('where')) {
            return this.processWhere(line, parentElement, doc);
        } else if (line.startsWith('return')) {
            return this.processReturn(line, parentElement, doc);
        } else if (line.startsWith('declare default element namespace')) {
            return this.processDefaultNamespace(line, parentElement, doc);
        } else if (line.startsWith('declare namespace')) {
            return this.processNamespace(line, parentElement, doc);
        } else if (line.startsWith('declare variable')) {
            return this.processDeclareVariable(line, parentElement, doc);
        } else {
            throw new Error(`Unknown XQuery statement: ${line}`);
        }
    }
    
    static processXQueryVersion(line, parentElement, doc) {
        const xqueryVersionElement = doc.createElement('XQueryVersion');
        const version = line.split('"')[1];
        xqueryVersionElement.textContent = version;
        parentElement.appendChild(xqueryVersionElement);
        return xqueryVersionElement;
    }

    static processDefaultNamespace(line, parentElement, doc) {
        const defaultNsElement = doc.createElement('DefaultNamespace');
        const uri = line.split('"')[1];
        defaultNsElement.setAttribute('uri', uri);
        parentElement.appendChild(defaultNsElement);
        return defaultNsElement;
    }

    static processLet(line, parentElement, doc) {
        const letElement = doc.createElement('Let');
        const variableName = this.extractVariable(line);
        const assignment = this.extractAssignment(line);
        letElement.setAttribute('variable', variableName);
        letElement.textContent = assignment;
        parentElement.appendChild(letElement);
        return letElement;
    }

    static processFor(line, parentElement, doc) {
        const forElement = doc.createElement('For');
        const variableName = this.extractVariable(line);
        const iteration = this.extractIteration(line);
        forElement.setAttribute('variable', variableName);
        forElement.textContent = iteration;
        parentElement.appendChild(forElement);
        return forElement;
    }

    static processIf(line, parentElement, doc) {
        const ifElement = doc.createElement('If');
        const condition = this.extractCondition(line);
        ifElement.textContent = condition;
        parentElement.appendChild(ifElement);
        return ifElement;
    }

    static processWhere(line, parentElement, doc) {
        const whereElement = doc.createElement('Where');
        const condition = line.split('where')[1].trim();
        whereElement.textContent = condition;
        parentElement.appendChild(whereElement);
        return whereElement;
    }

    static processReturn(line, parentElement, doc) {
        const returnElement = doc.createElement('Return');
        const returnValue = line.split('return')[1].trim();
        returnElement.textContent = returnValue;
        parentElement.appendChild(returnElement);
        return returnElement;
    }

    static processNamespace(line, parentElement, doc) {
        const nsElement = doc.createElement('Namespace');
        const [prefix, uri] = this.extractNamespace(line);
        nsElement.setAttribute('prefix', prefix);
        nsElement.setAttribute('uri', uri);
        parentElement.appendChild(nsElement);
        return nsElement;
    }

    static processDeclareVariable(line, parentElement, doc) {
        const variableElement = doc.createElement('DeclareVariable');
        const [variable, value] = this.extractDeclaredVariable(line);
        variableElement.setAttribute('variable', variable);
        variableElement.textContent = value;
        parentElement.appendChild(variableElement);
        return variableElement;
    }

    static extractVariable(line) {
        const match = line.match(/\$(\w+)/);
        return match ? match[1] : '';
    }

    static extractAssignment(line) {
        const match = line.match(/:=\s*(.*)/);
        return match ? match[1].trim() : '';
    }

    static extractIteration(line) {
        const match = line.match(/in\s*(.*)/);
        return match ? match[1].trim() : '';
    }

    static extractCondition(line) {
        const match = line.match(/if\s*\((.*)\)/);
        return match ? match[1].trim() : '';
    }

    static extractNamespace(line) {
        const match = line.match(/declare namespace (\w+) = "(.*?)"/);
        return match ? [match[1], match[2]] : ['', ''];
    }

    static extractDeclaredVariable(line) {
        const match = line.match(/declare variable (\$\w+) := (.*);/);
        return match ? [match[1], match[2]] : ['', ''];
    }
}

// Example XQuery string
const xqueryString = `
xquery version "3.1";

declare default element namespace "http://default.namespace.com";

declare namespace custom = "http://custom.namespace.com";

let $doc := doc("input.xml")

let $root_1 := $doc/root
let $root_1_xmlns_2 := $root_1/@xmlns
let $element_3 := $root_1/element
let $element_3_text_4 := normalize-space($element_3)
let $custom_element_5 := $root_1/custom:element
let $custom_element_5_text_6 := normalize-space($custom_element_5)
`;

// Convert XQuery to XML
const xmlOutput = XQueryParser.parse(xqueryString);
console.log(xmlOutput);
