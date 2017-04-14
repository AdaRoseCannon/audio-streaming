/*  */
var keys = new Set();
var a = new AudioContext();
var b = a.createScriptProcessor();
b.connect(a.destination);
b.onaudioprocess = function (evt) {
	outputBuffer = evt.outputBuffer.getChannelData(0);
	var t=evt.playbackTime;
	var dT=evt.outputBuffer.duration/evt.outputBuffer.length;
	for(var i=0; i<evt.outputBuffer.length; i++) {
		t+=dT;
		outputBuffer[i] = 1;
		for (const note of keys) {
			outputBuffer[i] *= square(num2Freq(note), t);
		}
	}
}

window.addEventListener('keydown', function (e) {
	keys.add(e.keyCode);
});

window.addEventListener('keyup', function (e) {
	keys.delete(e.keyCode);
});

function num2Freq(i) {
	return 440*Math.pow(2,(i-69)/12)
}

function pure(f, t) {
	return Math.sin(Math.PI*2*t*f)/2 + 0.5;
}

function triangle(f, t) {
	return sawtooth(f*2, t) * (square(f*2, t) ? 1 : -1);
}

function sawtooth(f, t) {
	return (f*t)%1;
}

function square(f, t) {
	return Math.round(Math.sin(Math.PI*2*t*f)/2 + 0.5);
}