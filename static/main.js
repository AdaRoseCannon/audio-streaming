'use strict';
/* eslint no-var: 0, no-console:0 */
/* global Float32Array */

var audioCtx = new AudioContext();
console.log(audioCtx.sampleRate);

// fetch buffer length in seconds and sampleRate configuration from server.
var config = false;

var ws = new WebSocket((location.hostname === 'localhost' ? 'ws://' : 'wss://') + location.host);
ws.binaryType = 'arraybuffer';

var audioPlaybackBuffers = [];
var audioPlayBackOffset = -1;

ws.addEventListener('message', function m(e) {
	if (typeof e.data === 'string') {
		config = JSON.parse(e.data);

		// start doing audio playback
		var playbackBufferLen = config.bufferDurationSeconds * audioCtx.sampleRate;
		var audioOutProcessor = audioCtx.createScriptProcessor();
		audioOutProcessor.onaudioprocess = function (audioProcessingEvent) {
			var currentData = audioPlaybackBuffers[0];

			var outBuffer1 = audioProcessingEvent.outputBuffer.getChannelData(0);
			var outBuffer2 = audioProcessingEvent.outputBuffer.getChannelData(1);
			var l = outBuffer1.length;
			var i = 0;

			// Iterate over the audio from the server and fill up the offset.
			for (i = 0; i < l; i++) {
				audioPlayBackOffset++;
				if (audioPlayBackOffset === playbackBufferLen) {
					audioPlaybackBuffers.shift();
					audioPlayBackOffset = -1;
					currentData = audioPlaybackBuffers[0];
				}

				// 0 if we are out of data
				outBuffer1[i] = outBuffer2[i] = currentData ? currentData[audioPlayBackOffset] : 0;
			}
		};

		// Create a filter for voices
		var filter = audioCtx.createBiquadFilter();
		filter.type = 'highshelf';
		filter.frequency.value = 200;

		var gain = audioCtx.createGain();
		gain.gain.value = 0.8;

		audioOutProcessor.connect(gain);
		// gain.connect(filter);
		gain.connect(audioCtx.destination);

		return console.log('Connected');
	} else {

		if (!config) return;

		// audio playback
		// start the resample the data from the microphone and then upload it
		resample(config.serverSampleRate, audioCtx.sampleRate, config.bufferDurationSeconds, new Float32Array(e.data), function (a) {
			var data = a.renderedBuffer.getChannelData(0);
			audioPlaybackBuffers.push(data);

			// it is going to be played straight away so ensure it plays from 0
			if (audioPlaybackBuffers.length === 1) audioPlayBackOffset = -1;
		});
	}
});

var tempBufferOffset = 0;
var tempBuffer;
var trash = [];

function startRecording() {

	var processor = audioCtx.createScriptProcessor();
	processor.onaudioprocess = function (audioProcessingEvent) {
		var buffer = audioProcessingEvent.inputBuffer.getChannelData(0);
		var outBuffer = audioProcessingEvent.outputBuffer.getChannelData(0);
		var l = buffer.length;
		var i = 0;

		// Iterate over the processed audio and fill up the buffer
		for (i = 0; i < l; i++) {
			tempBufferOffset++;

			// if we have run out of buffer make a new one
			if (tempBufferOffset === tempBuffer.length) {

				// start the resample the data from the microphone and then upload it
				resample(audioCtx.sampleRate, config.serverSampleRate, config.bufferDurationSeconds, tempBuffer, function (a) {
					var dataToUpload = a.renderedBuffer.getChannelData(0);
					ws.send(dataToUpload);
				});

				// put the tempBuffer in the trash and generate a new one
				var toTrash = tempBuffer;
				tempBuffer = trash.length ? trash.pop() : new Float32Array(config.bufferDurationSeconds * audioCtx.sampleRate);
				trash.push(toTrash);
				toTrash = undefined;

				tempBufferOffset = 0;
			}
			tempBuffer[tempBufferOffset] = buffer[i];
		}
	};

	navigator.mediaDevices.getUserMedia({
		audio: true,
		video: false
	})
	.then(function(stream) {
		var microphone = audioCtx.createMediaStreamSource(stream);

		// Create a filter for voices
		var filter = audioCtx.createBiquadFilter();
		filter.type = 'bandpass';
		filter.frequency.value = 170;
		filter.Q.value = 0.1;

		// Connect the microphone input to the stream
		microphone.connect(filter);

		// Find away to fill up the AudioBuffer
		filter.connect(processor);

		// Make sure the stream is read.
		processor.connect(audioCtx.destination);
	});
}

function resample(startSampleRate, targetSampleRate, bufferDurationSeconds, buffer, cb) {

	/* Get an OfflineAudioContext at the target sample rate.
	* `durationInSamples` is the number of audio samples you have.
	* `channels` is the number of channels (1 for mono, 2 for stereo). */
	var myOfflineAudioContext;
	if (OfflineAudioContext) {
		myOfflineAudioContext = new OfflineAudioContext(1, bufferDurationSeconds * targetSampleRate, targetSampleRate);
	} else if (window.webkitOfflineAudioContext) {
		myOfflineAudioContext = new window.webkitOfflineAudioContext(1, bufferDurationSeconds * targetSampleRate, targetSampleRate); /* eslint new-cap:0 */
	}

	/* Get an empty AudioBuffer at starting rate */
	var channels = 1;
	var b = myOfflineAudioContext.createBuffer(channels, bufferDurationSeconds * startSampleRate, startSampleRate);

	/* Copy your data in to the AudioBuffer */
	var channel;
	for (channel = 0; channel < channels; channel++) {
		var buf = b.getChannelData(channel);
		for (var i = 0; i < bufferDurationSeconds * startSampleRate; i++) {
			buf[i] = buffer[i];
		}
	}

	/* Play it from the beginning. */
	var source = myOfflineAudioContext.createBufferSource();
	source.buffer = b;
	source.connect(myOfflineAudioContext.destination);
	source.start(0);
	myOfflineAudioContext.oncomplete = function(audiobuffer) {
		/* audiobuffer contains audio resampled at target rate, use
		* audiobuffer.getChannelData(x) to get an ArrayBuffer for
		* channel x.
		*/
		cb(audiobuffer);
	}

	/* Start rendering as fast as the machine can. */
	myOfflineAudioContext.startRendering();
}

(function init() {

	var recButton = document.getElementById('record');
	recButton.addEventListener('click', function () {
		if (config) {
			tempBuffer = new Float32Array(config.bufferDurationSeconds * audioCtx.sampleRate);
			recButton.parentNode.removeChild(recButton);
			startRecording();
		}
	});
} ());