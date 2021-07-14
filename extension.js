/* jshint expr: true, esversion: 8 */
const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const fs = require("fs");
    const path = require("path");
    let status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
    const insightsOutput = vscode.window.createOutputChannel(`InSights`);
    status.command = "insights.status";
    var ignoreFile = ["node_modules", ".insightsIgnore", "*.rar", "*.zip", "*.waw", "*.svg", "*.png", "*.ico", "*.gif", "*.mp3", "*.mp4", "*.jpg", "*.jpeg", "*.raw"];
    var defaultIgnore = ["package.json", "package-lock.json", ".gitignore", ".eslintrc.yml", ".vscodeignore", "LICENSE", ".npmignore", ".travis.yml", ".jshintrc", "gulpfile.js", "license", "*.txt", "LICENSE.txt", ".git", "Cargo.toml", "target", "Lia.yaml", "EllieMod", "*.eiw"];
    var availableSettings = {
        exploreTimeout: x => x < 25000 && x > 2000,
        reExploreTimeout: x => x > 5000,
        noIgnoreNodeModules: x => x == "true" || x == "false" || x == true || x == false
    };
    var dirSearch = [];
    var settings = [];
    var intr;
    var q;

    function abbreviateNumber(value) {
        var newValue = value;
        if (value >= 1000) {
            var suffixes = ["", "k", "m", "b", "t"];
            var suffixNum = Math.floor(("" + value).length / 3);
            var shortValue = '';
            for (var precision = 2; precision >= 1; precision--) {
                shortValue = parseFloat((suffixNum != 0 ? (value / Math.pow(1000, suffixNum)) : value).toPrecision(precision));
                var dotLessShortValue = (shortValue + '').replace(/[^a-zA-Z 0-9]+/g, '');
                if (dotLessShortValue.length <= 2) {
                    break;
                }
            }
            if (shortValue % 1 != 0) shortValue = shortValue.toFixed(1);
            newValue = shortValue + suffixes[suffixNum];
        }
        return newValue;
    }

    var searchDir = function(dir) {
        return new Promise((resolve) => {
            fs.readdir(dir, {
                withFileTypes: true
            }, async function(err, dr) {
                if (err) {
                    console.log(err);
                }
                for (const item of Object.values(dr)) {
                    var absoluteExt = (x) => "." + x.split(".").splice(1).join(".");
                    if (!ignoreFile.includes(item.name) && ignoreFile.filter(x => x.includes("*")).map(x => x.split("*")[1] == absoluteExt(item.name)).filter(x => x).length == 0) {
                        var dirrectoryLike = (item.isDirectory() || item.isSymbolicLink());
                        var file = dirrectoryLike ? 0 : fs.readFileSync(path.resolve(dir + "/" + item.name), "utf8");
                        dirSearch.push([
                            item.name,
                            dirrectoryLike,
                            dirrectoryLike ? NaN : (fs.statSync(path.resolve(dir + "/" + item.name)).size),
                            dirrectoryLike ? false : {
                                line: file.split("\n").length,
                                charachter: file.length
                            },
                            dirrectoryLike ? "folder" : path.extname(item.name)
                        ]);
                        if (dirrectoryLike) {
                            await searchDir(dir + "/" + item.name);
                        }
                    } else {
                        insightsOutput.append(`[Info] ${item.name} ignored\n`);
                    }
                }
                resolve(dirSearch);
            });
        });
    };
    
    var getInsights = function() {
        var ms = new Date().getTime();
        insightsOutput.append('[Info] Exploring environment\n');
        var folder = vscode.workspace.workspaceFolders;
        if (folder) {
            if (fs.existsSync(folder[0].uri.fsPath + "/.insightsIgnore")) {
                insightsOutput.append('[Info] insightsIgnore exist getting ignore\n');
                fs.readFileSync(folder[0].uri.fsPath + "/.insightsIgnore", "utf8").split("\n").forEach(x => {
                    if (!x.includes("/\/") && x !== "" && x !== " ") {
                        if (x[0] !== "@") {
                            ignoreFile.push(x);
                        } else {
                            settings.push(x);
                        }
                    }
                });
            } else {
                ignoreFile = [...ignoreFile, ...defaultIgnore];
                insightsOutput.append('[Info] insightsIgnore not exist. Using default config\n');
            }
            status.hide();
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title: "Exploring environment...",
                cancellable: true
            }, (q, token) => {
                var cancellation = false;
                token.onCancellationRequested(() => {
                    cancellation = true;
                });
                var promise = new Promise(async (resolve) => {
                    var fixedSettings = settings.map(x => x.replace("@", "").split("="));
                    var parsedSettings = {};
                    fixedSettings.forEach(x => {
                        if (availableSettings[x[0]]) {
                            if (availableSettings[x[0]](x[1])) {
                                parsedSettings[x[0]] = x[1];
                            } else {
                                vscode.window.showWarningMessage(`${x[0]}'s value '${x[1]}' is not correct`);
                            }
                        } else {
                            vscode.window.showWarningMessage(x[0] + " is not recognized as correct option");
                        }
                    });
                    parsedSettings.noIgnoreNodeModules && parsedSettings.noIgnoreNodeModules !== "false" ? ignoreFile = ignoreFile.filter(x => x !== "node_modules") : false;
                    var result = await searchDir(folder[0].uri.fsPath);
                    insightsOutput.append(`[Info] exploring environment took ${Math.abs(ms-new Date().getTime())}ms\n`);

                    var filtered = {
                        files: {},
                        details: {
                            files: {
                                totalSize: 0,
                                totalLine: 0,
                                totalCharachter: 0,
                                totalFile: 0,
                                totalLang: 0
                            },
                            folders: 0
                        }
                    };
                    var extDef = (n) => n == "" || n == "." ? "ignore" : n.replace(".", "").toUpperCase();
                    result.forEach(element => {
                        if (element[4] == "folder") {
                            filtered.details.folders++;
                        }
                        if (!element[1]) {
                            filtered.details.files.totalFile++;
                            filtered.details.files.totalCharachter += element[3].charachter;
                            filtered.details.files.totalLine += element[3].line;
                            filtered.details.files.totalSize += element[2];
                            var ext = extDef(element[4]);
                            if (filtered.files[ext]) {
                                filtered.files[ext].line += element[3].line;
                                filtered.files[ext].size += element[2];
                                filtered.files[ext].charachter += element[3].charachter;
                                if (element[2] > filtered.files[ext].max.size) {
                                    filtered.files[ext].max = Object.assign({
                                        name: element[0],
                                        size: element[2]
                                    }, element[3]);
                                }
                            } else {
                                filtered.details.files.totalLang++;
                                filtered.files[ext] = {
                                    name: element[0],
                                    line: element[3].line,
                                    size: element[2],
                                    charachter: element[3].charachter,
                                    max: Object.assign({
                                        name: element[0],
                                        size: element[2]
                                    }, element[3])
                                };
                            }
                        } else {

                        }
                    });

                    function bytesToSize(bytes) {
                        var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
                        if (bytes == 0) return '0 Byte';
                        var i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
                        return Math.round(bytes / Math.pow(1024, i), 2) + ' ' + sizes[i];
                    }
                    q = 0;
                    intr ? intr instanceof Function ? clearInterval(intr) : false : false;
                    var mostUsedLang = Object.entries(filtered.files).map(x => [x[0], x[1].max.size]).reduce(function(p, v) {
                        return (p[1] > v[1] ? p : v);
                    })[0];
                    resolve(true);
                    status.show();
                    var intrF = () => {
                        if (q == 0) {
                            status.text = `$(info) ${bytesToSize(filtered.details.files.totalSize)} of file has been written`;
                            intr = setInterval(intrF, parsedSettings.exploreTimeout || 7000);
                        } else if (q == 1) {
                            status.text = `$(info) ${abbreviateNumber(filtered.details.files.totalLine)} line of code written`;
                        } else if (q == 2) {
                            status.text = `$(info) ${abbreviateNumber(filtered.details.files.totalCharachter)} charachter written`;
                        } else if (q == 3) {
                            if (filtered.details.files.totalLang == 2) {
                                status.text = `$(info) You only used ${Object.keys(filtered.files)[0]}`;
                            } else if (filtered.details.files.totalLang == 1) {
                                status.text = `$(info) You only used ${Object.keys(filtered.files).join(" and ")}`;
                            } else {
                                status.text = `$(info) ${filtered.details.files.totalLang} different language used`;
                            }
                        } else if (q == 4) {
                            status.text = `$(info) ${mostUsedLang} is the most used language`;
                        } else if (q == 5) {
                            status.text = `$(info) Largest file in ${mostUsedLang} is ${filtered.files[mostUsedLang].max.name}`;
                        } else {
                            status.text = "InSights Idle";
                            q = 0;
                            setTimeout(getInsights, parsedSettings.reExploreTimeout || 5000);
                            clearInterval(intr);
                        }
                        q++;
                    };
                    cancellation ? false : intrF();
                });
                return promise;
            });
        } else {
            insightsOutput.append("[ERR ] No workspace or dirrectory is open exploring canceled\n");
            vscode.window.showErrorMessage("No workspace or dirrectory is open InSights unavailable");
            status.color = "red";
            status.text = `$(info) InSights Unavailable`;
            status.show();
        }
    };
    getInsights();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(getInsights));
    context.subscriptions.push(vscode.commands.registerCommand('insights.status', () => {}));
    context.subscriptions.push(vscode.commands.registerCommand('extension.createinsightsignore', function() {
        var folder = vscode.workspace.workspaceFolders;
        if (folder) {
            if (fs.existsSync(folder[0].uri.fsPath + "/.insightsIgnore")) {
                insightsOutput.append("[ERR ] insightsIgnore file already exist\n");
                vscode.window.showErrorMessage("insightsIgnore file already exist.");
            } else {
                var defaultData = "// ******************************************************************************\n// * You can ignore file extensions like *.[fileExtension]                      *\n// * You can add settings like @[settingName]=[value]                           *\n// * You have to write all rules line by line without ','(Comma)                *\n// * You cannot add comment end of the rule. Example: e.js //Test File          *\n// * You cannot add multiple rules to one line                                  *\n// * You are free to delete this comment                                        *\n// * Settings as default                                                        *\n// *  - @exploreTimeout=7000      -  Max 25000 Min 2000 Timeout between reports *\n// *  - @noIgnoreNodeModules=false -  Overrides default node_modules ignore     *\n// *  - @reExploreTimeout=5000    -  Min 5000 Timeout for reExploring project   *\n// ******************************************************************************\n" + defaultIgnore.join("\n");
                fs.writeFile(folder[0].uri.fsPath + "/.insightsIgnore", defaultData, (err) => {
                    if (err) {
                        insightsOutput.append(`[ERR ] ${err.message}\n`);
                        vscode.window.showErrorMessage(err.message);
                    }
                });
                vscode.window.showInformationMessage("insightsIgnore file created you may want to edit this file");
            }
        } else {
            insightsOutput.append("[ERR ] No workspace or dirrectory is open create insightsIgnore canceled\n");
            vscode.window.showErrorMessage("Open workspace or folder to create insightsIgnore");
        }
    }));
}
exports.activate = activate;

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
