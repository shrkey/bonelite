//
// Bonelite - a cut down interface based on Bonescript
//
// Copyright (C) 2011 - Texas Instruments, Jason Kridner

var fs = require('fs');
var bone = require('./bone');
//var functions = require('./functions');
var hw = require('./hardware');
/*
var serial = require('./serial');
var iic = require('./iic');
var my = require('./my');
*/

var f = {};

// Keep track of allocated resources
var gpio = {};
var gpioInt = {};
var pwm = {};
var ain = false;

exports.getpin = function( pin ) {
    if(typeof pin == 'object') return(pin);
    else if(typeof pin == 'string') return(bone.pins[pin]);
    else if(typeof pin == 'number') return(bone.pinIndex[pin]);
    else throw("Invalid pin: " + pin);
};


/*
f.digitalWrite = function(pin, value, callback) {
    var myCallback = false;
    if(callback) myCallback = function(resp) {
        if(!resp || (typeof resp != 'object')) resp = {'data': resp};
        callback(resp);
    };
    pin = my.getpin(pin);
    if(debug) winston.debug('digitalWrite(' + [pin.key, value] + ');');
    value = parseInt(Number(value), 2) ? 1 : 0;

    hw.writeGPIOValue(pin, value, myCallback);

    return(true);
};
f.digitalWrite.args = ['pin', 'value', 'callback'];

f.digitalRead = function(pin, callback) {
    pin = my.getpin(pin);
    if(debug) winston.debug('digitalRead(' + [pin.key] + ');');
    var resp = {};
    resp = hw.readGPIOValue(pin, resp, callback);
    return(resp.value);
};
f.digitalRead.args = ['pin', 'callback'];

f.analogRead = function(pin, callback) {
    pin = my.getpin(pin);
    if(debug) winston.debug('analogRead(' + [pin.key] + ');');
    var resp = {};
    if(!ain) {
        ain = hw.enableAIN();
    }
    resp = hw.readAIN(pin, resp, callback);
    return(resp.value);
}; 
f.analogRead.args = ['pin', 'callback'];

f.shiftOut = function(dataPin, clockPin, bitOrder, val, callback) {
    dataPin = my.getpin(dataPin);
    clockPin = my.getpin(clockPin);
    if(debug) winston.debug('shiftOut(' + [dataPin.key, clockPin.key, bitOrder, val] + ');');
    var i = 0;
    var bit;
    var clock = 0;

    function next() {
        if(debug) winston.debug('i = ' + i);
        if(debug) winston.debug('clock = ' + clock);
        if(i == 8) return(callback());
        if(bitOrder == g.LSBFIRST) {
            bit = val & (1 << i);
        } else {
            bit = val & (1 << (7 - i));
        }
        if(clock === 0) {
            clock = 1;
            if(bit) {
                f.digitalWrite(dataPin, g.HIGH, next);
            } else {
                f.digitalWrite(dataPin, g.LOW, next);
            }
        } else if(clock == 1) {
            clock = 2;
            f.digitalWrite(clockPin, g.HIGH, next);
        } else if(clock == 2) {
            i++;
            clock = 0;
            f.digitalWrite(clockPin, g.LOW, next);
        }
    }

    if(callback) {
        next();
    } else {
        for(i = 0; i < 8; i++) {
            if(bitOrder == g.LSBFIRST) {
                bit = val & (1 << i);
            } else {
                bit = val & (1 << (7 - i));
            }

            if(bit) {
                f.digitalWrite(dataPin, g.HIGH);
            } else {
                f.digitalWrite(dataPin, g.LOW);
            }
            f.digitalWrite(clockPin, g.HIGH);
            f.digitalWrite(clockPin, g.LOW);
        }
    }
};
f.shiftOut.args = ['dataPin', 'clockPin', 'bitOrder', 'val', 'callback'];

f.attachInterrupt = function(pin, handler, mode, callback) {
    pin = my.getpin(pin);
    if(debug) winston.debug('attachInterrupt(' + [pin.key, handler, mode] + ');');
    var n = pin.gpio;
    var resp = {'pin':pin, 'attached': false};

    // Check if we don't have the required Epoll module
    if(!epoll.exists) {
        resp.err = 'attachInterrupt: requires Epoll module';
        if(debug) winston.debug(resp.err);
        if(callback) callback(resp);
        return(resp.attached);
    }

    // Check if pin isn't already configured as GPIO
    if(typeof gpio[n] == 'undefined') {
        resp.err = 'attachInterrupt: pin ' + pin.key + ' not already configured as GPIO';
	if(debug) winston.debug(resp.err);
        resp.attached = false;
        resp.configured = false;
        if(callback) callback(resp);
        return(resp.attached);
    }

    // Check if someone already has a handler configured
    if(typeof gpioInt[n] != 'undefined') {
	resp.err = 'attachInterrupt: pin ' + pin.key + ' already has an interrupt handler assigned';
	if(debug) winston.debug(resp.err);
        resp.attached = false;
        resp.configured = true;
        if(callback) callback(resp);
        return(resp.attached);
    }

    handler = (typeof handler === "string") ? my.myeval('(' + handler + ')') : handler;

    var intHandler = function(err, fd, events) {
        var m = {};
        if(err) {
            m.err = err;
        }
        fs.readSync(gpioInt[n].valuefd, gpioInt[n].value, 0, 1, 0);
        m.pin = pin;
        m.value = parseInt(Number(gpioInt[n].value), 2);
        if(typeof handler =='function') m.output = handler(m);
        else m.output = {handler:handler};
        if(m.output && (typeof callback == 'function')) callback(m);
    };

    try {
        gpioInt[n] = hw.writeGPIOEdge(pin, mode);
        gpioInt[n].epoll = new epoll.Epoll(intHandler);
        fs.readSync(gpioInt[n].valuefd, gpioInt[n].value, 0, 1, 0);
        gpioInt[n].epoll.add(gpioInt[n].valuefd, epoll.Epoll.EPOLLPRI);
        resp.attached = true;
    } catch(ex) {
        resp.err = 'attachInterrupt: GPIO input file not opened: ' + ex;
        if(debug) winston.debug(resp.err);
    }
    if(callback) callback(resp);
    return(resp.attached);
};
f.attachInterrupt.args = ['pin', 'handler', 'mode', 'callback'];

f.detachInterrupt = function(pin, callback) {
    pin = my.getpin(pin);
    if(debug) winston.debug('detachInterrupt(' + [pin.key] + ');');
    var n = pin.gpio;
    if(typeof gpio[n] == 'undefined' || typeof gpioInt[n] == 'undefined') {
        if(callback) callback({'pin':pin, 'detached':false});
        return(false);
    }
    gpioInt[n].epoll.remove(gpioInt[n].valuefd);
    delete gpioInt[n];
    if(callback) callback({'pin':pin, 'detached':true});
    return(true);
};
f.detachInterrupt.args = ['pin', 'callback'];
*/

exports.startPWM = function( pin ) {
	
	hw.startPWM( pin );
	
}
exports.startPWM.args = ['pin'];

exports.stopPWM = function( pin ) {
	
	hw.stopPWM( pin );
	
}
exports.stopPWM.args = ['pin'];

// See http://processors.wiki.ti.com/index.php/AM335x_PWM_Driver's_Guide
// That guide isn't useful for the new pwm_test interface
exports.analogWrite = function(pin, value, freq, callback) {
    //pin = my.getpin(pin);
	//console.log( 'Writing to ' + pin );
    
    freq = freq || 2000.0;
    var resp = {};

    // Perform update
    resp = hw.writePWMFreqAndValue(pin, '', freq, value, resp);

    // Save off the freq, value and PWM assignment
    //pwm[pin].freq = freq;
    //pwm[pin].value = value;

    // All done
    if(callback) callback({value:true});
    return(true);
};
exports.analogWrite.args = ['pin', 'value', 'freq', 'callback'];

/*
f.getEeproms = function(callback) {
    var eeproms = {};
    eeproms = hw.readEeproms(eeproms);
    if(eeproms == {}) {
        if(debug) winston.debug('No valid EEPROM contents found');
    }
    if(callback) {
        callback(eeproms);
    }
    return(eeproms);
};
f.getEeproms.args = ['callback'];

f.readTextFile = function(filename, callback) {
    if(typeof callback == 'function') {
        var cb = function(err, data) {
            callback({'err':err, 'data':data});
        };
        fs.readFile(filename, 'ascii', cb);
    } else {
        return fs.readFileSync(filename, 'ascii');
    }
};
f.readTextFile.args = ['filename', 'callback'];

f.writeTextFile = function(filename, data, callback) {
    if(typeof callback == 'function') {
        var cb = function(err) {
            callback({'err':err});
        };
        fs.writeFile(filename, data, 'ascii', cb);
    } else {
        try {
            return fs.writeFileSync(filename, data, 'ascii');
        } catch(ex) {
            winston.error("writeTextFile error: " + ex);
            return(false);
        }
    }
};
f.writeTextFile.args = ['filename', 'data', 'callback'];

f.getPlatform = function(callback) {
    var platform = {
        'platform': bone,
        'name': "BeagleBone",
        'bonescript': package_json.version
    };
    platform = hw.readPlatform(platform);
    if(callback) callback(platform);
    return(platform);
};
f.getPlatform.args = ['callback'];

f.echo = function(data, callback) {
    winston.info(data);
    callback({'data': data});
    return(data);
};
f.echo.args = ['data', 'callback'];

f.setDate = function(date, callback) {
    child_process.exec('date -s "' + date + '"', dateResponse);
    function dateResponse(error, stdout, stderr) {
        if(typeof callback != 'function') return;
        if(error) callback({'error': error});
        if(stdout) callback({'stdout': stdout});
        if(stderr) callback({'stderr': stderr});
    }
};
f.setDate.args = ['date', 'callback'];

// Exported variables
exports.bone = bone; // this likely needs to be platform and be detected
for(var x in f) {
    exports[x] = f[x];
}
for(var x in functions) {
    exports[x] = functions[x];
}
for(var x in serial) {
    exports[x] = serial[x];
}
for(var x in iic) {
    exports[x] = iic[x];
}
for(var x in g) {
    exports[x] = g[x];
}

// Global variable assignments
// This section is broken out because it will eventually be deprecated
var alreadyRan = false;
function setGlobals() {
    for(var x in exports) {
        global[x] = exports[x];
    }
    global.run = run;
    process.nextTick(run);

    function run() {
        if(alreadyRan) return(false);
        alreadyRan = true;
        // 'setup' and 'loop' are globals that may or may not be defined
        if(typeof global.setup == 'function') global.setup();
        while(1) {
            if(typeof global.loop == 'function') global.loop();
        }
    }
}

exports.setGlobals = setGlobals;
*/