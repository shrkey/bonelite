// Copyright (C) 2013 - Texas Instruments, Jason Kridner
//
// This is meant to hold some private functions
//
var fs = require('fs');
var child_process = require('child_process');
var bone = require('./bone');

var capemgr;

var debug = false;

exports.file_exists = fs.exists;
exports.file_existsSync = fs.existsSync;
if(typeof exports.file_exists == 'undefined') {
    var path = require('path');
    exports.file_exists = path.exists;
    exports.file_existsSync = path.existsSync;
}

exports.file_find = function(path, prefix, attempts) {
    if(typeof attempts == 'undefined') attempts = 1;
    for(var i = 0; i < attempts; i++) {
        try {
            var files = fs.readdirSync(path);
            for(var j in files) {
                if(files[j].indexOf(prefix) === 0) {
                    return(path + '/' + files[j]);
                }
            }
        } catch(ex) {
        }
    }
};

exports.is_capemgr = function() {
    if(typeof capemgr == 'undefined') {
        capemgr = exports.file_find('/sys/devices', 'bone_capemgr.');
        if(typeof capemgr == 'undefined') capemgr = false;
    }
    return(capemgr);
};

/*
// Note, this just makes sure there was an attempt to load the
// devicetree fragment, not if it was successful
exports.load_dt = function(name, pin) {
    if(!exports.is_capemgr()) return(false);
    var slots = fs.readFileSync(capemgr + '/slots', 'ascii');
    if(slots.indexOf(name) < 0) {
        try {
            fs.writeFileSync(capemgr + '/slots', name);
        } catch(ex) {
            var slotRegex = new RegExp('\\d+(?=\\s*:.*,bs.*' + pin.key + ')', 'gm');
            var slot = slots.match(slotRegex);
            if(slot[0]) {
                if(debug) winston.debug('Attempting to unload conflicting slot ' +
                    slot[0] + ' for ' + name);
                try {
                    fs.writeFileSync(capemgr + '/slots', '-'+slot[0]);
                    fs.writeFileSync(capemgr + '/slots', name);
                } catch(ex2) {
                    winston.error('Unable to unload conflicting ' +
                        'capemgr slot for ' + name + ': ' + ex2);
                    return(false);
                }
            } else {
                winston.error('Unable to load capemgr slot for ' + name + ': ' + ex);
                return(false);
            }
        }
    }
    return(exports.wait_on_dt(name));
};

exports.wait_on_dt = function(name) {
    var slots;
    if(!exports.is_capemgr()) return(false);
    for(var i = 0; i < 20000; i++) {
        slots = fs.readFileSync(capemgr + '/slots', 'ascii');
        if(slots.indexOf(name) >= 0) return(true);
    }
    winston.error('Failed to find devicetree fragment: ' + name);
    winston.info(slots);
    return(false);
};

exports.create_dt = function(pin, data, template, load, force_create) {
    var handler = function(error, stdout, stderr) {
        winston.debug('handler = ' + JSON.stringify(arguments));
        if(!error && load) {
            exports.load_dt(fragment, pin);
        }
    };

    template = template || 'bspm';
    load = (typeof load === 'undefined') ? true : load;
    var fragment = template + '_' + pin.key + '_' + data.toString(16);
    var dtsFilename = '/lib/firmware/' + fragment + '-00A0.dts';
    var dtboFilename = '/lib/firmware/' + fragment + '-00A0.dtbo';
    if(force_create || !exports.file_existsSync(dtboFilename)) {
        var templateFilename = require.resolve('bonescript').replace('index.js',
            template + '_template.dts');
        winston.debug('templateFilename = ' + templateFilename);
        var dts = fs.readFileSync(templateFilename, 'utf8');
        dts = dts.replace(/!PIN_KEY!/g, pin.key);
        dts = dts.replace(/!PIN_DOT_KEY!/g, pin.key.replace(/_/, '.'));
        dts = dts.replace(/!PIN_FUNCTION!/g, pin.options[data&7]);
        dts = dts.replace(/!PIN_OFFSET!/g, pin.muxRegOffset);
        dts = dts.replace(/!DATA!/g, '0x' + data.toString(16));
        if(pin.pwm) {
            dts = dts.replace(/!PWM_MODULE!/g, pin.pwm.module);
            dts = dts.replace(/!PWM_INDEX!/g, pin.pwm.index);
            dts = dts.replace(/!DUTY_CYCLE!/g, 500000);
        }
        fs.writeFileSync(dtsFilename, dts);
        winston.debug('fragment = ' + fragment);
        var command = 'dtc -O dtb -o ' + dtboFilename + ' -b 0 -@ ' + dtsFilename;
        winston.debug('command = ' + command);
        child_process.exec(command, handler);
    } else {
        if(load) return(exports.load_dt(fragment, pin));
    }
    
    if(load) return(exports.wait_on_dt(fragment));
    return(false);
};

exports.myeval = function(x) {
    winston.debug('myeval("' + x + '");');
    var y;
    try {
        y = eval(x);
    } catch(ex) {
        y = undefined;
        winston.error('myeval error: ' + ex);
        throw('myeval error: ' + ex);
    }
    winston.debug('result = ' + y);
    return(y);
};

exports.require = function(packageName, onfail) {
    var y = {};
    try {
        y = require(packageName);
        y.exists = true;
    } catch(ex) {
        y.exists = false;
        if(debug) winston.debug("Optional package '" + packageName + "' not loaded");
        if(onfail) onfail();
    }
    return(y);
};

exports.getpin = function(pin) {
    if(typeof pin == 'object') return(pin);
    else if(typeof pin == 'string') return(bone.pins[pin]);
    else if(typeof pin == 'number') return(bone.pinIndex[pin]);
    else throw("Invalid pin: " + pin);
};

exports.wrapCall = function(m, func, funcArgs, cbArgs) {
    if(!m.module.exists) {
        if(debug) winston.debug(m.name + ' support module not loaded.');
        return(function(){});
    }
    funcArgs.unshift('port');
    funcArgs.push('callback');
    var newFunction = function() {
        var args = [];
        var port = arguments[0];
        var callback = false;
        for(var i = 1; i < arguments.length; i++) {
            winston.debug('Adding argument ' + funcArgs[i] + ' to wrapper');
            if(funcArgs[i] == 'callback') {
                callback = arguments[i];
                var wrappedCallback = function() {
                    var cbData = {};
                    for(var j = 0; j < cbArgs.length; j++) {
                        cbData[cbArgs[j]] = arguments[j];
                    }
                    cbData.event = 'callback';
                    winston.debug('cbData = ' + JSON.stringify(cbData));
                    callback(cbData);
                };
                args.push(wrappedCallback);
            } else {
                args.push(arguments[i]);
            }
        }
        if(!m.openPorts[port]) {
            if(callback) callback({'err': m.name + ' ' + port + ' not opened'});
            return(false);
        }
        winston.debug('Calling ' + m.name + '[' + port + '].' + func + '(' + args + ')');
        var x = m.openPorts[port][func].apply(
                m.openPorts[port], args);
        if(callback) callback({'event': 'return', 'return': x});
        return(x);
    };
    newFunction.args = funcArgs;
    return(newFunction);
};

exports.wrapOpen = function(m, openArgs) {
    if(!m.module.exists) {
        if(debug) winston.debug(m.name + ' support module not loaded.');
        return(function(){});
    }
    openArgs.unshift('port');
    openArgs.push('callback');
    var newFunction = function() {
        var args = {};
        for(var i = 0; i < openArgs.length; i++) {
            args[openArgs[i]] = arguments[i];
        }
        var port = args.port;
        var callback = args.callback;
        winston.debug(m.name + ' opened with ' + JSON.stringify(arguments));
        if(m.ports[port] && m.ports[port].devicetree) {
            var fragment = m.ports[port].devicetree;
            if(!exports.is_capemgr()) {
                if(callback) callback({err:'Kernel does not include CapeMgr module'});
                return(false);
            }
            if(!exports.load_dt(fragment)) {
                if(callback) callback({'err': 'Devicetree overlay fragment ' +
                    fragment + ' not loaded'});
                return(false);
            }
        }
        m.openPorts[port] = m.doOpen(args);
        if(!m.openPorts[port]) {
            if(callback) callback({'err': 'Unable to ' + m.name});
            return(false);
        }
        for(var e in m.events) {
            var addHandler = function(m, port, e) {
                var handler = function() {
                    var myargs = arguments;
                    myargs.event = e;
                    for(var i = 0; i < arguments.length; i++) {
                        myargs[m.events[e][i]] = arguments[i];
                    }
                    callback(myargs);
                };
                m.openPorts[port].on(e, handler);
            };
            addHandler(m, port, e);
        }
        if(callback) callback({'event':'return', 'value':true});
        return(true);
    };
    newFunction.args = openArgs;
    return(newFunction);
};

exports.pin_data = function(slew, direction, pullup, mux) {
    var pinData = 0;
    if(slew == 'slow') pinData |= 0x40;
    if(direction != g.OUTPUT) pinData |= 0x20;
    switch(pullup) {
    case 'disabled':
        pinData |= 0x08;
        break;
    case 'pullup':
        pinData |= 0x10;
        break;
    default:
        break;
    }
    pinData |= (mux & 0x07);
    return(pinData);
};
*/