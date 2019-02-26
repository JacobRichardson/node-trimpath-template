/**
 * TrimPath Template.
 * Copyright (C) 2004, 2005 Metaha.
 *
 * TrimPath Template is licensed under the GNU General Public License
 * and the Apache License, Version 2.0, as follows:
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place - Suite 330, Boston, MA 02111-1307, USA.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// TODO: Debugging mode vs stop-on-error mode - runtime flag.
// TODO: Handle || (or) characters and backslashes.
// TODO: Add more modifiers.

var join = require('path').join;
var dirname = require('path').dirname;

//TODO: Implement a way to generalized the tokens and change the numbers to relefect token.length. Also include special characters.
var defaults = {
    OPENING : "{"
}
module.exports = defaults;

module.exports.filters = {};
module.exports.collapseWhitespace = false;
module.exports.collapseWhitespaceReg = [
  //[ regexp, replaceWith ]
  [ /[\t\n\ ]{2,}(?![^<>]*(<\/pre>|<\/textarea>))/gi, ' ' ]
  , [ /^[\t\n\ ]{1,}</g, '<' ]
];

var compile = module.exports.compile = function (str, options) {
    options = options || { root : "" };
    
    if (options.filename) {
        options.root = (options.filename)
            ? dirname(options.filename)
            : process.cwd();
    }

    var t = TrimPath.parseTemplate(str, options);

    return function (context) {
        var deleteModifiers;

        context = context || {};

        if (!context._MODIFIERS) {
            deleteModifiers = true;
        }

        //TODO: should they be merged if they both exist?
        context._MODIFIERS = context._MODIFIERS || module.exports.filters;

        var result = t.process(context, { throwExceptions : true });

        if (deleteModifiers) {
            delete context._MODIFIERS;
        }

        return result;
    }
};

var render = module.exports.render = function (str, context) {
    return compile(str)(context);
};

var TrimPath = module.exports.TrimPath = {};
var UNDEFINED;

TrimPath.processIncludes = function (tmplContent, options) {
    var reg = /\{\{include ([^\}]*)}\}/gi
    var path;
    var tmp;

    while (path = reg.exec(tmplContent)) {
        try {
            //ugh; loading this here because in the browser this fails (with webpack)
            var fs = require('fs');
            tmp = fs.readFileSync(join(options.root, path[1]), 'utf8');
        }
        catch (e) {
            if (e.code === 'ENOENT') {
                //rethrow the error with out this error code
                delete e.code;
                e.message = 'Include file not found \'' + join(options.root, path[1]) + '\'';
            }

            throw e;
        }

        tmp = TrimPath.processIncludes(tmp, {
            root : join(options.root, dirname(path[1]))
        });

        tmplContent = tmplContent.replace(path[0], tmp);
    }

    return tmplContent;
}

TrimPath.evalEx = function(src) { return eval(src); };

TrimPath.parseTemplate = function(tmplContent, optTmplName, optEtc) {
    if (optEtc == null)
        optEtc = TrimPath.parseTemplate_etc;

    tmplContent = TrimPath.processIncludes(tmplContent, optTmplName);

    var funcSrc = parse(tmplContent, optTmplName, optEtc);
    var func = TrimPath.evalEx(funcSrc, optTmplName, 1);
    if (func != null)
        return new optEtc.Template(optTmplName, tmplContent, funcSrc, func, optEtc);
    return null;
}

TrimPath.parseTemplate_etc = {};            // Exposed for extensibility.
TrimPath.parseTemplate_etc.statementTag = "forelse|for|if|elseif|else|var|macro";
TrimPath.parseTemplate_etc.statementDef = { // Lookup table for statement tags.
    "if"     : { delta:  1, prefix: "if (", suffix: ") {", paramMin: 1 },
    "else"   : { delta:  0, prefix: "} else {" },
    "elseif" : { delta:  0, prefix: "} else if (", suffix: ") {", paramDefault: "true" },
    "/if"    : { delta: -1, prefix: "}" },
    "for"    : { delta:  1, paramMin: 3,
                    prefixFunc : function(stmtParts, state, tmplName, etc) {
                    if (stmtParts[2] != "in")
                        throw new etc.ParseError(tmplName, state.line, "bad for loop statement: " + stmtParts.join(' '));
                    var iterVar = stmtParts[1];
                    var listVar = "__LIST__" + iterVar;
                    return [ "var ", listVar, " = ", stmtParts[3], ";",
                            // Fix from Ross Shaull for hash looping, make sure that we have an array of loop lengths to treat like a stack.
                            "var __LENGTH_STACK__;",
                            "if (typeof(__LENGTH_STACK__) == 'undefined' || !__LENGTH_STACK__.length) __LENGTH_STACK__ = new Array();",
                            "__LENGTH_STACK__[__LENGTH_STACK__.length] = 0;", // Push a new for-loop onto the stack of loop lengths.
                            "if ((", listVar, ") != null) { ",
                            "var ", iterVar, "_ct = 0;",       // iterVar_ct variable, added by B. Bittman
                            "for (var ", iterVar, "_index in ", listVar, ") { ",
                            iterVar, "_ct++;",
                            "if (typeof(", listVar, "[", iterVar, "_index]) == 'function') {continue;}", // IE 5.x fix from Igor Poteryaev.
                            "__LENGTH_STACK__[__LENGTH_STACK__.length - 1]++;",
                            "var ", iterVar, " = ", listVar, "[", iterVar, "_index];" ].join("");
                    } },
    "forelse" : { delta:  0, prefix: "} } if (__LENGTH_STACK__[__LENGTH_STACK__.length - 1] == 0) { if (", suffix: ") {", paramDefault: "true" },
    "/for"    : { delta: -1, prefix: "} }; delete __LENGTH_STACK__[__LENGTH_STACK__.length - 1];" }, // Remove the just-finished for-loop from the stack of loop lengths.
    "var"     : { delta:  0, prefix: "var ", suffix: ";" },
    "macro"   : { delta:  1,
                    prefixFunc : function(stmtParts, state, tmplName, etc) {
                        var macroName = stmtParts[1].split('(')[0];
                        return [ "var ", macroName, " = function",
                                stmtParts.slice(1).join(' ').substring(macroName.length),
                                "{ var _OUT_arr = []; var _OUT = { write: function(m) { if (m) _OUT_arr.push(m); } }; " ].join('');
                    } },
    "/macro"  : { delta: -1, prefix: " return _OUT_arr.join(''); };" }
}
TrimPath.parseTemplate_etc.modifierDef = {
    "eat"        : function(v)    { return ""; },
    "escape"     : function(s)    { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    "capitalize" : function(s)    { return String(s).toUpperCase(); },
    "default"    : function(s, d) { return s != null ? s : d; }
}
TrimPath.parseTemplate_etc.modifierDef.h = TrimPath.parseTemplate_etc.modifierDef.escape;

TrimPath.parseTemplate_etc.Template = function(tmplName, tmplContent, funcSrc, func, etc) {
    this.process = function(context, flags) {
        if (context == null)
            context = {};
        if (context._MODIFIERS == null)
            context._MODIFIERS = {};
        if (context.defined == null)
            context.defined = function(str) { return (context[str] != undefined); };
        for (var k in etc.modifierDef) {
            if (context._MODIFIERS[k] == null)
                context._MODIFIERS[k] = etc.modifierDef[k];
        }
        if (flags == null)
            flags = {};
        var resultArr = [];
        var resultOut = { write: function(m) { resultArr.push(m); } };
        try {
            func(resultOut, context, flags);
        } catch (e) {
            if (flags.throwExceptions == true)
                throw e;
            var result = resultArr.join("") + "[ERROR: " + e.toString() + (e.message ? '; ' + e.message : '') + "]";
            result["exception"] = e;
            return result;
        }
        return resultArr.join("");
    }
    this.name       = tmplName;
    this.source     = tmplContent;
    this.sourceFunc = funcSrc;
    this.toString   = function() { return "TrimPath.Template [" + tmplName + "]"; }
}
TrimPath.parseTemplate_etc.ParseError = function(name, line, message) {
    this.name    = name;
    this.line    = line;
    this.message = message;
}
TrimPath.parseTemplate_etc.ParseError.prototype.toString = function() {
    return ("TrimPath template ParseError in " + this.name + ": line " + this.line + ", " + this.message);
}

var parse = function(body, tmplName, etc) {
    body = cleanWhiteSpace(body);
    var funcText = [ "var TrimPath_Template_TEMP = function(_OUT, _CONTEXT, _FLAGS) { with (_CONTEXT) {" ];
    var state    = { stack: [], line: 1 };                              // TODO: Fix line number counting.
    var endStmtPrev = -2;
    while (endStmtPrev < body.length) {
        var begStmt = endStmtPrev;
        // Scan until we find some statement markup.
        begStmt = body.indexOf("{{", begStmt);
        while (begStmt >= 0) {
            var endStmt = body.indexOf('}}', begStmt + 1);
            var stmt = body.substring(begStmt, endStmt + 2);

            debugLog("stmt " + stmt);

            var blockrx = stmt.match(/^\{(cdata|minify|eval)/); // From B. Bittman, minify/eval/cdata implementation.
            if (blockrx) {
                var blockType = blockrx[1];
                var blockMarkerBeg = begStmt + blockType.length + 1;
                var blockMarkerEnd = body.indexOf('}}', blockMarkerBeg);
                if (blockMarkerEnd >= 0) {
                    var blockMarker;
                    if( blockMarkerEnd - blockMarkerBeg <= 0 ) {
                        blockMarker = "{{/" + blockType + "}}";
                    } else {
                        blockMarker = body.substring(blockMarkerBeg + 1, blockMarkerEnd);
                    }

                    var blockEnd = body.indexOf(blockMarker, blockMarkerEnd + 1);

                    debugLog("BLOCK MARKER: " + blockMarker);

                    if (blockEnd >= 0) {
                        //CHANGED TO 2 BC OF {{
                        emitSectionText(body.substring(endStmtPrev + 2, begStmt - 1), funcText);

                        //CHANGED TO 2 BC OF {{
                        var blockText = body.substring(blockMarkerEnd + 2, blockEnd);

                        debugLog("BLOCK TEXT: " + blockText);

                        if (blockType == 'cdata') {
                            emitText(blockText, funcText);
                        } else if (blockType == 'minify') {
                            emitText(scrubWhiteSpace(blockText), funcText);
                        } else if (blockType == 'eval') {
                            if (blockText != null && blockText.length > 0) // From B. Bittman, eval should not execute until process().
                                funcText.push('_OUT.write( (function() { ' + blockText + ' })() );');
                        }
                        begStmt = endStmtPrev = blockEnd + blockMarker.length - 1;
                    }
                }
            } else if (body.charAt(begStmt - 2) != '$' &&               // Not an expression or backslashed,
                        body.charAt(begStmt - 1) != '\\') {              // so check if it is a statement tag.
                                        //CHANGE TO + 2 BC OF {{        ADDED IN ACCOUNTING FOR POUND SIGNS
                var offset = (body.charAt(begStmt + 2) == '/' || body.charAt(begStmt + 2) == '#' ? 3 : 2); // Close tags offset of 2 skips '/'.
                                                                        // 10 is larger than maximum statement tag length.
               

                debugLog("\nSTRING THAT IS BEING SEARCHED: " + body.substring(begStmt + offset, begStmt + 10 + offset));
                debugLog("RESULT OF SEARCH: " + body.substring(begStmt + offset, begStmt + 10 + offset).search(TrimPath.parseTemplate_etc.statementTag) + "\n");
                if (body.substring(begStmt + offset, begStmt + 10 + offset).search(TrimPath.parseTemplate_etc.statementTag) == 0){
                    debugLog("BREAK BC OF MATCH");
                    break;                                              // Found a match.
                }
            }
            begStmt = body.indexOf("{", begStmt + 1);
        }
        debugLog("\nOUTSIDE INNER LOOP");
        if (begStmt < 0)                              // In "a{for}c", begStmt will be 1.
            break;
        var endStmt = body.indexOf("}}", begStmt); // In "a{for}c", endStmt will be 5.
        if (endStmt < 0)
            break;
            //CHANGED 1 to 2 bc of }}    
        emitSectionText(body.substring(endStmtPrev + 2, begStmt), funcText);

        debugLog("STATMENT STRING TO EMIT STATMENT");
        debugLog(body.substring(begStmt, endStmt + 2) + "\n");

        emitStatement(body.substring(begStmt, endStmt + 2), state, funcText, tmplName, etc);
        endStmtPrev = endStmt;
    }

    emitSectionText(body.substring(endStmtPrev + 2), funcText);
    if (state.stack.length != 0)
        throw new etc.ParseError(tmplName, state.line, "unclosed, unmatched statement(s): " + state.stack.join(","));
    funcText.push("}}; TrimPath_Template_TEMP");
    return funcText.join("");
}

var emitStatement = function(stmtStr, state, funcText, tmplName, etc) {
    //REMOVING DOUBLE CURLY BRACES FROM STATMENT
    stmtStr = stmtStr.slice(2, stmtStr.length - 2);
    if(stmtStr.charAt(0) == '#'){
        stmtStr = stmtStr.slice(1, stmtStr.length);
    }
    var parts = stmtStr.split(' ');
    var stmt = etc.statementDef[parts[0]]; // Here, parts[0] == for/if/else/...

    debugLog("STMTSTR: " + stmtStr)
    debugLog("PARTS: " + parts);
    debugLog("STMT: " + stmt);
    if (stmt == null) {                    // Not a real statement.
        emitSectionText(stmtStr, funcText);
        return;
    }
    if (stmt.delta < 0) {
        if (state.stack.length <= 0)
            throw new etc.ParseError(tmplName, state.line, "close tag does not match any previous statement: " + stmtStr);
        state.stack.pop();
    }
    if (stmt.delta > 0){
        debugLog("PUSING STATMENT TO STACK: " + stmtStr); 
        state.stack.push(stmtStr);
    }
    if (stmt.paramMin != null &&
        stmt.paramMin >= parts.length)
        throw new etc.ParseError(tmplName, state.line, "statement needs more parameters: " + stmtStr);
    if (stmt.prefixFunc != null)
        funcText.push(stmt.prefixFunc(parts, state, tmplName, etc));
    else
        funcText.push(stmt.prefix);
    if (stmt.suffix != null) {
        if (parts.length <= 1) {
            if (stmt.paramDefault != null)
                funcText.push(stmt.paramDefault);
        } else {
            for (var i = 1; i < parts.length; i++) {
                if (i > 1)
                    funcText.push(' ');
                funcText.push(parts[i]);
            }
        }
        funcText.push(stmt.suffix);
    }
}

var emitSectionText = function(text, funcText) {
    if (text.length <= 0)
        return;

    var lines = text.split('\n');

    for (var i = 0; i < lines.length; i++) {
        emitSectionTextLine(lines[i], funcText);
        if (!module.exports.collapseWhitespace && i < lines.length - 1) {
            funcText.push('_OUT.write("\\n");\n');
        }
    }
}

var emitSectionTextLine = function(line, funcText) {
    var endMarkPrev = '}}';
    //CHANGED TO -2 BECAUSE THE END MARK GET SWTICH TO 2 CHARACTERS INSTEAD OF 1
    var endExprPrev = -2;
    while (endExprPrev + endMarkPrev.length < line.length) {
        var begMark = "${{", endMark = "}}";
        var begExpr = line.indexOf(begMark, endExprPrev + endMarkPrev.length); // In "a${b}c", begExpr == 1
        if (begExpr < 0)
            break;
        if (line.charAt(begExpr + 2) == '%') {
            begMark = "${%";
            endMark = "%}";
        }
        var endExpr = line.indexOf(endMark, begExpr + begMark.length);         // In "a${b}c", endExpr == 4;
        if (endExpr < 0)
            break;
        emitText(line.substring(endExprPrev + endMarkPrev.length, begExpr), funcText);
        // Example: exprs == 'firstName|default:"John Doe"|capitalize'.split('|')
        var exprArr = line.substring(begExpr + begMark.length, endExpr).replace(/\|\|/g, "#@@#").split('|');
        for (var k in exprArr) {
            if (exprArr[k].replace) // IE 5.x fix from Igor Poteryaev.
                exprArr[k] = exprArr[k].replace(/#@@#/g, '||');
        }
        funcText.push('_OUT.write(');
        emitExpression(exprArr, exprArr.length - 1, funcText);
        funcText.push(');');
        endExprPrev = endExpr;
        endMarkPrev = endMark;
    }
    emitText(line.substring(endExprPrev + endMarkPrev.length), funcText);
}

var emitText = function(text, funcText) {
    if (text == null ||
        text.length <= 0)
        return;
    text = text.replace(/\\/g, '\\\\');
    text = text.replace(/\n/g, '\\n');
    text = text.replace(/"/g,  '\\"');

    if (module.exports.collapseWhitespace) {
      module.exports.collapseWhitespaceReg.forEach(function (set) {
        var reg = set[0]
          , replace = set[1] || ''
          ;

        text = text.replace(reg, replace);
      });
    }

    funcText.push('_OUT.write("');
    funcText.push(text);
    funcText.push('");');
}

var emitExpression = function(exprArr, index, funcText) {
    // Ex: foo|a:x|b:y1,y2|c:z1,z2 is emitted as c(b(a(foo,x),y1,y2),z1,z2)
    var expr = exprArr[index]; // Ex: exprArr == [firstName,capitalize,default:"John Doe"]
    if (index <= 0) {          // Ex: expr    == 'default:"John Doe"'
        funcText.push(expr);
        return;
    }
    var parts = expr.split(':');
    funcText.push('_MODIFIERS["');
    funcText.push(parts[0]); // The parts[0] is a modifier function name, like capitalize.
    funcText.push('"](');
    emitExpression(exprArr, index - 1, funcText);
    if (parts.length > 1) {
        funcText.push(',');
        funcText.push(parts[1]);
    }
    funcText.push(')');
}

var cleanWhiteSpace = function(result) {
    result = result.replace(/\t/g,   "    ");
    result = result.replace(/\r\n/g, "\n");
    result = result.replace(/\r/g,   "\n");
    result = result.replace(/^(\s*\S*(\s+\S+)*)\s*$/, '$1'); // Right trim by Igor Poteryaev.

    return result;
}

var scrubWhiteSpace = function(result) {
    result = result.replace(/^\s+/g,   "");
    result = result.replace(/\s+$/g,   "");
    result = result.replace(/\s+/g,   " ");
    result = result.replace(/^(\s*\S*(\s+\S+)*)\s*$/, '$1'); // Right trim by Igor Poteryaev.

    return result;
}

// The DOM helper functions depend on DOM/DHTML, so they only work in a browser.
// However, these are not considered core to the engine.
//
TrimPath.parseDOMTemplate = function(elementId, optDocument, optEtc) {
    if (optDocument == null)
        optDocument = document;
    var element = optDocument.getElementById(elementId);
    var content = element.value;     // Like textarea.value.
    if (content == null)
        content = element.innerHTML; // Like textarea.innerHTML.
    content = content.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return TrimPath.parseTemplate(content, elementId, optEtc);
}

TrimPath.processDOMTemplate = function(elementId, context, optFlags, optDocument, optEtc) {
    return TrimPath.parseDOMTemplate(elementId, optDocument, optEtc).process(context, optFlags);
}


const debug = false;

function debugLog (log) {
    if(debug){
        console.log(log);
    }
}