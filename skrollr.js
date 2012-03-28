/*
 * TODO
 * -add a scale factor to scale the timeline
 */

(function(document, undefined) {
	var
		rxKeyframeAttribute = /^data-(\d+)$/,
		rxNumericValue = /^((-|\+)?[0-9.]+)(%|px|em|ex|pt|in|cm|mm|pc|deg)?$/,
		rxTransform,
		rxPropSplit = /:|;/g,
		rxPropEasing = /(\w+)\[(\w+)\]/,
		rxCamelCase = /-([a-z])/g,
		parsers = {},
		steps = {},
		easings = {};


	var parsersAndSteps = {
		//Simple constant values which won't be interpolated.
		constant: {
			/**
			 * Doesn't actually parse something. Will just return the value.
			 */
			parser: function(val) {
				return val;
			},
			/**
			 * Doesn't interpolate at all.
			 */
			step: function(val) {
				return val;
			}
		},
		//Simple numeric values with unit which can easily be interpolated.
		//Not used directly, only by composedNumeric.
		numeric: {
			/**
			 * Parses a single numeric value with optional unit.
			 * @return An array with the numeric value at first position and the unit at second position.
			 */
			parser: function(val) {
				var match = val.match(rxNumericValue);

				if(match === null) {
					throw 'Can\'t parse "' + val + '" as numeric value.'
				}

				return [parseFloat(match[1], 10), match[3] || ''];
			},
			/**
			 * Calculates the new value by interpolating between val1 and val2 using the given easing.
			 * If only the first parameter is specified, it just sets the value.
			 */
			step: function(val1, val2, progress) {
				if(val2 === undefined) {
					return val1[0] + val1[1];
				}

				//Check if the units are the same
				if(val1[1] !== val2[1]) {
					throw "Can't interpolate between '" + val[0] + val1[1] + "' and '" + val1[0] + val2[1] + "'";
				}

				return (val1[0] + ((val2[0] - val1[0]) * progress)) + val1[1];
			}
		},
		//Values which are composed of multipe numeric values like "0% 0%"
		composedNumeric: {
			/**
			 * Parses a value which is composed of multiple numeric values separated by a single space.
			 * @return An array of arrays. See "numeric.parser" for info about the individual arrays.
			 */
			parser: function(val) {
				var
					values = [],
					all = val.split(' ');

				for(var i = 0; i < all.length; i++) {
					//Use the simple numeric parser for the indiviual values
					values.push(parsersAndSteps.numeric.parser(all[i]));
				}

				return values;
			},
			step: function(val1, val2, progress) {
				var stepped = [];

				if(val2 === undefined) {
					for(var i = 0; i < val1.length; i++) {
						stepped.push(parsersAndSteps.numeric.step(val1[i]));
					}
				} else {
					if(val1.length !== val2.length) {
						throw "Can't interpolate between two composed values with different number of values.";
					}

					for(var i = 0; i < val1.length; i++) {
						stepped.push(parsersAndSteps.numeric.step(val1[i], val2[i], progress));
					}
				}

				return stepped.join(' ');
			}
		},
		transform: {
			parser: function(val) {

			},
			step: function(val1, val2, progress, easing) {

			}
		},
		color: {
			parser: function(val) {

			},
			step: function(val1, val2, progress, easing) {

			}
		}
	};

	//All supported properties which have constant values
	var p = [
		'display', 'visibility',
		'background', 'background-attachment', 'background-clip', 'background-color', 'background-image', 'background-origin', 'background-repeat'
	];

	for(var i = 0; i < p.length; i++) {
		parsers[p[i]] = parsersAndSteps.constant.parser;
		steps[p[i]] = parsersAndSteps.constant.step;
	}

	//All supported properties which have single numeric values or which are composed of numeric values (single value is a composition of one value).
	p = [
		'opacity',
		'top', 'right', 'bottom', 'left',
		'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
		'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
		'font-size',
		'width', 'height',
		'border-width', 'border-radius',
		'background-position', 'background-size'
	];

	for(var i = 0; i < p.length; i++) {
		parsers[p[i]] = parsersAndSteps.composedNumeric.parser;
		steps[p[i]] = parsersAndSteps.composedNumeric.step;
	}

	//All values which can have color values
	p = [
		'color',
		'background-color',
		'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'
	];

	for(var i = 0; i < p.length; i++) {
		parsers[p[i]] = parsersAndSteps.color.parser;
		steps[p[i]] = parsersAndSteps.color.step;
	}

	p = null;

	/**
	 * Constructor.
	 */
	function Skrollr(options) {
		var self = this;

		options = options || {};

		if(options.easing) {
			for(var e in options.easing) {
				if(Object.prototype.hasOwnProperty.call(options.easing, e)) {
					easings[e] = options.easing[e];
				}
			}
		}

		//The container element. The parent of all skrollables.
		this.container = document.getElementsByTagName('body')[0];

		//Scale factor to scale keyFrames.
		this.scale = options.scale || 1;

		//All event listeners
		this.listeners = {};

		//A list of all elements which should be animated associated with their the data.
		this.skrollables = [];

		//Will contain the max data-end value available.
		this.maxKeyFrame = 0;



		var allElements = this.container.getElementsByTagName('*');

		//Iterate over all elements inside the container.
		for(var i = 0; i < allElements.length; i++) {
			var
				el = allElements[i];
				fx = {},
				keyFrames = [];


			//Iterate over all attributes and search for keyframe attributes.
			for (var k = 0; k < el.attributes.length; k++) {
				var
					attr = el.attributes[k],
					match = attr.name.match(rxKeyframeAttribute);

				if(match !== null) {
					var frame = (match[1] | 0) * this.scale;

					keyFrames.push({
						frame: frame,
						props: attr.value
					});

					if(frame > this.maxKeyFrame) {
						this.maxKeyFrame = frame;
					}
				}
			}


			//Does this element have keyframes?
			if(keyFrames.length) {
				keyFrames.sort(function(a, b) {
					return a.frame - b.frame;
				});

				var sk = {
					element: el,
					keyFrames: keyFrames
				};

				self._parseProps(sk);

				this.skrollables.push(sk);

				el.className += ' skrollable';
			}
		}

		this.container.style.overflow = 'auto';
		this.container.style.overflowX = 'hidden';
		this.container.style.position = 'relative';

		//Add a dummy element in order to get a large enough scrollbar
		this.dummy = document.createElement('div');

		var dummyStyle = this.dummy.style;

		dummyStyle.width = '1px';
		dummyStyle.height = (this.maxKeyFrame + Skrollr.getViewportHeight()) + 'px';
		dummyStyle.position = 'absolute';
		dummyStyle.left = '0px';
		dummyStyle.top = '0px';
		dummyStyle.zIndex = '0';
		dummyStyle.background = 'transparent';

		this.container.appendChild(this.dummy);

		//TODO add some throttle to scroll event
		this.onScroll = function() {
			var top = Skrollr.getScrollTop(self.container);

			self.trigger('scroll', top);

			self.trigger('beforerender', top);

			self._render(top);

			self.trigger('afterrender', top);
		};

		this.setScrollTop(0);

		//Let's go
		Skrollr.addEventListener(document, 'scroll', this.onScroll);

		return this;
	}

	/**
		Triggers an event, calls each listener function
	*/
	Skrollr.prototype.trigger = function(type) {
		var fns = this.listeners[type];

		if(fns !== undefined) {
			var args = Array.prototype.slice.call(arguments, 1);

			for(var i = 0; i < fns.length; i++) {
				fns[i].apply(this, args);
			}
		}
	};

	/**
	 * Add a new event listener
	 */
	Skrollr.prototype.on = function(type, fn) {
		(this.listeners[type] = this.listeners[type] || []).push(fn);

		return this;
	};


	Skrollr.prototype.setScrollTop = function(top) {
		pageYOffset = top;
		document.body.scrollTop = top;
		document.documentElement.scrollTop = top;
		this.onScroll();
	};

	/**
	 * Calculate and sets the style properties for the element at the given frame
	 */
	Skrollr.prototype._calcStep = function(skrollable, frame) {
		var frames = skrollable.keyFrames;

		//We are before the first frame, the element is not visible
		if(frame < frames[0].frame) {
			Skrollr.setStyle(skrollable.element, 'display', 'none');
		}
		//We are after the last frame, the element gets all props from last keyFrame
		else if(frame > frames[frames.length - 1].frame) {
			Skrollr.setStyle(skrollable.element, 'display', 'block');

			var last = frames[frames.length - 1];

			for(var key in last.props) {
				if(Object.prototype.hasOwnProperty.call(last.props, key)) {
					Skrollr.setStyle(skrollable.element, key, steps[key](last.props[key].value));
				}
			}
		}
		//We are between two frames
		else {
			Skrollr.setStyle(skrollable.element, 'display', 'block');

			//Find out between which two keyFrames we are right now
			for(var i = 0; i < frames.length - 1; i++) {
				if(frame >= frames[i].frame && frame <= frames[i + 1].frame) {
					var left, right;

					left = frames[i];
					right = frames[i + 1];

					for(var key in left.props) {
						if(Object.prototype.hasOwnProperty.call(left.props, key)) {

							//If the left keyframe has a property which the right doesn't, we just set it without interprolating
							if(!Object.prototype.hasOwnProperty.call(right.props, key)) {
								Skrollr.setStyle(skrollable.element, key, steps[key](left.props[key].value));
							} else {
								var progress = (frame - left.frame) / (right.frame - left.frame);

								if(left.props[key].easing) {
									progress = easings[left.props[key].easing](progress);
								}

								Skrollr.setStyle(skrollable.element, key, steps[key](left.props[key].value, right.props[key].value, progress));
							}
						}
					}

					break;
				}
			}
		}
	};

	/**
	 * Renders all elements
	 */
	Skrollr.prototype._render = function(top) {
		for(var i = 0; i < this.skrollables.length; i++) {
			this._calcStep(this.skrollables[i], top);
		}

		return this;
	};

	/**
	 * Parses the properties for each keyFrame of the given skrollable.
	 */
	Skrollr.prototype._parseProps = function(skrollable) {
		//Iterate over all keyframes
		for(var i = 0; i < skrollable.keyFrames.length; i++) {
			var
				frame = skrollable.keyFrames[i],
				//Get all properties and values in an array
				allProps = frame.props.split(rxPropSplit),
				prop, value, easing;

			frame.props = {};

			//Iterate over all props and values (+2 because [prop,value,prop,value,...])
			for(var k = 0; k < allProps.length - 1; k += 2) {
				prop = allProps[k];
				value = allProps[k + 1];
				easing = prop.match(rxPropEasing);

				//Is there an easing specified for this prop?
				if(easing !== null) {
					prop = easing[1];
					easing = easing[2];
				}

				//Save the prop for this keyframe with his value and easing function
				frame.props[prop] = {
					value: parsers[prop](value),
					easing: easing
				};
			}
		}
	};


	/*
		Public static helpers
	*/
	Skrollr.getViewportHeight = function() {
		return document.documentElement.clientHeight;
	};

	/**
		Get an elements top scrollbar offset.
	*/
	Skrollr.getScrollTop = function() {
		return pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;

		/*
		if(typeof pageYOffset!= 'undefined'){
			//most browsers
			return pageYOffset;
		}
		else{
			var B= document.body; //IE 'quirks'
			var D= document.documentElement; //IE with doctype
			D= (D.clientHeight)? D: B;
			return D.scrollTop;
		}
		*/
	};

	/**
		Attach an event handler to a DOM element
	*/
	Skrollr.addEventListener = function(el, type, fn) {
		if (el.addEventListener) {
			el.addEventListener(type, fn, false);
		} else if (elem.attachEvent) {
			el.attachEvent('on' + type, fn);
		}
	};

	/**
	 * Set the style property on the given element. Adds prefixes where needed.
	 */
	Skrollr.setStyle = function(el, prop, val) {
		//TODO add prefix support
		el.style[Skrollr.camelCase(prop)] = val;
	};

	Skrollr.camelCase = function(text) {
		return text.replace(rxCamelCase, function(str, p1) {
			return p1.toUpperCase();
		});
	};


	//Global api
	window.skrollr = {
		//Main entry point
		init: function(options) {
			return new Skrollr(options);
		}
	};
}(document));