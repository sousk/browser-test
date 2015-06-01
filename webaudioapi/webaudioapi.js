(function(global) {

var DATA = {
    HEAAC: 'TOHKA_feat_Raya.m4a',
    MP3:   'TOHKA_feat_Raya.mp3'
};

var documnet = global.document;

function main() {
    var tester = new WebAudioApiTester({
        output: document.querySelector('output')
    });
    global.tester = tester;
    
    Array.prototype.forEach.call(document.querySelectorAll('a[data-audiotest]'), function(elm) {
        elm.addEventListener('click', function() {
            var val = this.dataset.audiotest;
            if (val && tester[val]) {
                tester[val]();
            }
            else {
                console.warn('missing', val);
            }
        }, false);
    });
}

function WebAudioApiTester(conf) {
    this.ctx = new (global.AudioContext || global.webkitAudioContext)();
    this.output = conf.output;
}
WebAudioApiTester.prototype = {
    load:          load,
    log:           log,
    playMP3:       playMP3,
    playHEAAC:     playHEAAC,
    playHEAACthroughAudio: playHEAACthroughAudio,
    playAudioElement:      playAudioElement
};

function playHEAAC() {
    var that = this, ctx = this.ctx;
    if (global.buf) {
        _play(ctx, global.buf);
        that.log('ok');
        return;
    }

    this.load(DATA.HEAAC, function(response) {
        that.log('decoding HE-AAC');
        var t = Date.now();

        ctx.decodeAudioData(response, function(buffer) {
            that.log('takes', Date.now() - t, 'ms');
            global.buf = buffer;
            _play(ctx, buffer);
            that.log('started');
        });
    });
}

function playMP3() {
    var that = this, ctx = this.ctx;

    this.load(DATA.MP3, function(response) {
        that.log('decoding MP3');
        var t = Date.now();

        ctx.decodeAudioData(response, function(buffer) {
            that.log('takes', Date.now() - t, 'ms');
            _play(ctx, buffer);
            that.log('started');
        });
    });
}

function _play(ctx, buffer) {
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0);
    global.src = src;
}

function playHEAACthroughAudio() {
    if (global.audio) {
        global.audio.play();
        this.log('kicked "play" again');
        return;
    }
    var that = this, ctx = this.ctx;
    _createAudioElement(DATA.MP3, function(audio) {
        var src = ctx.createMediaElementSource(audio);
        var gainNode = ctx.createGain();
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        global.gain = gainNode.gain;
        gainNode.gain.value = 0.1;
        // audio.volume = 0.2;
        audio.play();
        global.audio = audio;
        that.log('kicked');
    }, false);
}
function playAudioElement() {
    if (global.audio) {
        global.audio.play();
        this.log('kicked "play" again');
        return;
    }
    var that = this;
    _createAudioElement(DATA.HEAAC, function(audio) {
        audio.play();
        that.log('kicked "play"');
        global.audio = audio;
    });
}
function _createAudioElement(source, handler) {
    var audio = new Audio();
    audio.addEventListener('loadstart', function() {
        handler && handler(this);
    }, false);
    audio.src = source;
}

function load(source, handler) {
    var request = new XMLHttpRequest();
    request.open('GET', source, true);
    request.responseType = 'arraybuffer';
    request.onload = function() {
        handler && handler(request.response);
    };
    request.send();
}

function log() {
    var buf = [];
    Array.prototype.forEach.call(arguments, function(arg) {
        buf.push(arg);
    });
    if (buf.length > 0) {
        if (this.output) {
            this.output.innerText += buf.join(' ') + "\n";
        }
        else {
            console.log.apply(console, buf);
        }
    }
}


main();

})(this.self || global);
