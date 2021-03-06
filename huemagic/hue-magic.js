module.exports = function(RED)
{
	"use strict";

	function HueMagic(config)
	{
		RED.nodes.createNode(this, config);

		var scope = this;
		let async = require('async');
		var isEndless = config.endless;
		var restoreState = config.restore;

		// STEPS INITIALIZATION
		this.steps = config.steps;
		this.randomOrder = false;

		//
		// STATUS CHECK
		this.nodeActive = true;
		this.isAnimating = false;
		this.firstRun = false;

		//
		// INITIALIZE STATUS
		if(scope.steps == null)
		{
			this.status({fill: "grey", shape: "dot", text: "no animation specified"});
		}
		else
		{
			scope.status({fill: "grey", shape: "dot", text: "stopped"});
		}

		//
		// HELPER
		this.delay = function(ms)
		{
			return function (callback)
			{
				if(scope.isAnimating == true)
				{
					setTimeout(function(){ callback(); }, ms);
				}
				else
				{
					callback(true);
				}
			}
		}

		this.shuffleOrder = function(a)
        {
            var j, x, i;
            for (i = a.length - 1; i > 0; i--)
            {
                j = Math.floor(Math.random() * (i + 1));
                x = a[i];
                a[i] = a[j];
                a[j] = x;
            }
            return a;
        }

		//
		// SET START STATUS
		this.animationStarted = function()
		{
			return function (callback)
			{
				var message = {};
				message.animation = {};
				message.animation.status = true;
				message.animation.restore = restoreState;

				scope.send(message);
				callback();
			}
		}

		//
		// SET STOP STATUS
		this.animationStopped = function()
		{
			var message = {};
			message.animation = {};
			message.animation.status = false;
			message.animation.restore = restoreState;

			scope.send(message);
		}

		//
		// SEND ANIMATIONS STEP BY STEP
		this.step = function(step)
		{
			return function (callback)
			{
				if(scope.isAnimating == true)
				{
					var message = {};
					message.payload = step;
					message.payload.on = true;

					scope.send(message);

					if(typeof step.transitionTime != 'undefined')
					{
						setTimeout(function(){ callback(); }, parseFloat(step.transitionTime)*1000);
					}
					else
					{
						setTimeout(function(){ callback(); }, 200);
					}
				}
				else
				{
					callback(true);
				}
			}
		}

		//
		// PREPARE ANIMATION STEPS
		this.prepareAnimationSteps = function(steps)
		{
			var stepsParsed = JSON.parse(steps);
			var aSteps = [];

			// ANIMATION STARTED (LET DEVICES KNOW)
			if(scope.firstRun == false)
			{
				aSteps.push(scope.animationStarted());
				scope.firstRun = true;
			}

			// PUSH ANIMATIONS WITH DELAYS
			for (var i in stepsParsed)
			{
				var aStep = stepsParsed[i];
				aSteps.push(scope.delay(aStep.delay));
				aSteps.push(scope.step(aStep.animation));
			}

			return aSteps;
		}

		//
		// START / STOP ANIMATION
		this.animate = function(animationSteps)
		{
			var animation = scope.prepareAnimationSteps(animationSteps);

			// ANIMATE
			async.waterfall(animation, function(stopped, animated)
			{
				if(stopped)
				{
					return false;
				}

				// ENDLESS?
				if(isEndless == true && scope.nodeActive == true && scope.isAnimating == true)
				{
					// SHUFFLE ANIMATION IF RANDOM ORDER
					if(scope.randomOrder == true)
					{
						animationSteps = scope.shuffleOrder(animationSteps);
					}

					// RESTART
					scope.animate(animationSteps);
				}
				else
				{
					scope.animationStopped();
					scope.isAnimating = false;

					scope.status({fill: "grey", shape: "dot", text: "stopped"});
				}
			});
		}

		//
		// ENABLE HUE MAGIC ANIMATION
		this.on('input', function(msg)
		{
			if(scope.steps != null||typeof msg.payload.steps != 'undefined')
			{
				scope.steps = (typeof msg.payload.steps != 'undefined') ? msg.payload.steps : scope.steps;

				// SPECIALS CONFIG
				if(typeof msg.payload.specials != 'undefined')
				{
					// APPLY RANDOM ORDER CONFIG
					if(typeof msg.payload.specials.randomOrder != 'undefined')
					{
						scope.randomOrder = msg.payload.specials.randomOrder;
					}
				}

				// TURN ON ANIMATION
				if(typeof msg.payload.animate == 'undefined'||msg.payload.animate == true||msg.payload === true)
				{
					if(scope.isAnimating == false)
					{
						scope.status({fill: "green", shape: "dot", text: "animating…"});

						scope.isAnimating = true;
						scope.animate(scope.steps);
					}
				}

				// TURN OFF ANIMATION
				if((typeof msg.payload.animate != 'undefined' && msg.payload.animate == false)||msg.payload === false)
				{
					scope.animationStopped();
					scope.isAnimating = false;

					scope.status({fill: "grey", shape: "dot", text: "stopped"});
				}
			}
			else
			{
				// NO ANIMATION SPECIFIED
				this.status({fill: "red", shape: "ring", text: "no animation specified"});
			}
		});

		//
		// CLOSE NDOE / REMOVE ANIMATION
		this.on('close', function()
		{
			scope.nodeActive = false;
		});
	}

	RED.nodes.registerType("hue-magic", HueMagic);

	//
	// GET ANIMATIONS
	RED.httpAdmin.get('/hue/animations', function(req, res, next)
	{
		let fs = require("fs");
		let path = require("path");

		var allAnimations = [];
		var dir = path.resolve(__dirname, 'animations');

		fs.readdirSync(dir).forEach(filename => {
			var filepath = path.resolve(dir, filename);
			var stat = fs.statSync(filepath);
			var isFile = stat.isFile();
			var fileID = path.basename(filepath, '.json');

			if(isFile)
			{
				var animation = JSON.parse(fs.readFileSync(filepath, "utf8"));
				animation.info.id = fileID;

				allAnimations.push(animation);
			};
		});

		// SEND ALL ANIMATIONS
		res.end(JSON.stringify(allAnimations));
	});
}
