/**
 * Cisco Finesse Interprocess Communication using Local Storage - JavaScript Library
 * Version 11.5
 * Custome Application Development and Integration (CADI) 
 * Advanced Services
 * Cisco Systems, Inc.
 * http://www.cisco.com/
 *
 * Portions created or assigned to Cisco Systems, Inc. are
 * Copyright (c) 2017 Cisco Systems, Inc. or its affiliated entities.  All Rights Reserved.
 */
/**
 * This JavaScript library is made available to Cisco partners and customers as
 * a convenience to help minimize the cost of Cisco Finesse integration and customizations.
 * This library can be used in Cisco Finesse deployments.  Cisco does not
 * permit the use of this library in customer deployments that do not include
 * Cisco Finesse.  Support for the JavaScript library is provided if customer has purchase 
 * Day 2 Support from the CADI team. Like any custom deployment, it is the
 * responsibility of the partner and/or customer to ensure that the
 * customization works correctly and this includes ensuring that the Cisco
 * Finesse IPC API JavaScript is properly integrated into 3rd party applications.
 * Cisco reserves the right to make changes to the JavaScript code and
 * corresponding API as part of the normal Cisco Finesse release cycle.  The
 * implication of this is that new versions of the JavaScript might be
 * incompatible with applications built on older Finesse integrations.  That
 * said, it is Cisco's intention to ensure JavaScript compatibility across
 * versions as much as possible and Cisco will make every effort to clearly
 * document any differences in the JavaScript across versions in the event
 * that a backwards compatibility impacting change is made.
 */

/**
 * Setting up the cadi.modules Namespace
 */
var cadi = cadi || {};
cadi.modules = cadi.modules || {};


/**
 * This module provides the Finesse Interprocess Communication (IPC) using Local Storage API.
 * Following the module pattern the module is created by an Immediately-Invoked Function Expression (IIFE).
 * The module is initialized by calling the .init() function, passing in your callback handler. When an event is 
 * received from the Finesse Gadget, the callback is called. 
 */
cadi.modules.FinesseIPCLSAPI = (function () {
    'use strict';
    var currUserObj,
        dialogs = [],
        currSelectedDialog,
        notReadyReasons,
        signoutReasons,
        phoneBooks,
        wrapupReasons,
        onEventCallback,
        heartbeatTimer, 
        missedHBCounter=0, 

        /**
         * @private
         * The localstorage event handler. When an event is received on the LocalStorage location,
         * this function is called passing the Event object. The event is processed and then the 
         * applications callback is called passing the event. 
         * @param {Object} event
         *     The topic category.
         */
        _lsMsgReceiver = function (ev) {

            let msgObj;

            // Make sure the messsage is the one we care about (i.e. messageFromFinesse)
            // if not ignore the event. 
            if (ev.key !== 'messageFromFinesse') {
                return; // ignore other keys
            }

            // Make sure there is a body in the event.
            if (!ev.newValue) {
                return; // ignore empty msg or msg reset
            }

            try {
                // The event body is a JSON string, so parse into an object.
                msgObj = JSON.parse(ev.newValue);
            } catch (err) {
                console.log("Exception Caught while executing JSON.parse for message received from Finesse, Err=" + err.message);
            }

            // Check tto makd sure the message parsed correctly. 
            if (msgObj !== undefined) {
                // Procees the event. 
                switch (msgObj.messageType) {
                    case 'connection-status':
                        if (msgObj.connectionStatus === 'Connected') {
                            // The Finesse Desktop has reconnected to the server, so let's get the current user object.
                            _send_message({messageType: 'get-user'});
                        }
                        break;
                    case 'user-update':
                        // Get the user object from the message.
                        currUserObj = msgObj.user;

                        // If the agent state is not LOGOUT and the reasons and phone books have not been retrieved yet
                        // send a message to the Gadget to retrieve each of them.
                        if (msgObj.user.state !== "LOGOUT") {
                            if (notReadyReasons === undefined)
                                _send_message({
                                    messageType: 'get-notready-reasons'
                                });
                            if (signoutReasons === undefined)
                                _send_message({
                                    messageType: 'get-signout-reasons'
                                });
                            if (phoneBooks === undefined)
                                _send_message({
                                    messageType: 'get-phonebooks'
                                });
                            if (wrapupReasons === undefined)
                                _send_message({
                                    messageType: 'get-wrapup-reasons'
                                });
  
                            // Add Heartbeat handling.
                            if (heartbeatTimer === undefined)
                            { 
                                //Set the heartbeat handler to fire every 60000
                                heartbeatTimer = setInterval(_handleHeartbeatMsg, 60000);

                            }

  
                        }
                        break;
                    case 'new-dialog':
                    case 'dialog-update':

                        // Get the Agent's participant from the Dialog object.
                        var myParticipant = _getMyParticipant(msgObj.dialog);

                        // check to see if the dialog is list of dialogs, and if so replace the existing. 
                        if (dialogs.length > 0) {
                            let index;
                            let found = false;
                            for (var x in dialogs) {
                                // Let's loop the dialog collection looking for the Active Dialog

                                if (dialogs[x].id === msgObj.dialog.id) {
                                    // replace the dialog
                                    dialogs[x] = msgObj.dialog;
                                    index = x;
                                    found = true;
                                }
                            }

                            // Okay we didn't find the dialog in our collection so add it.
                            if (!found) {
                                dialogs.push(msgObj.dialog);
                                index = dialogs.length - 1;
                            }


                        } else {
                            // No dialogs in the collection, so add the dialog.
                            dialogs.push(msgObj.dialog);
                        }

                        break;

                    case 'end-dialog':
                        if (dialogs.length > 0) {
                            let index;

                            for (var x in dialogs) {
                                // Let's loop the dialog collection looking for this dialog object so that we can remove it.

                                if (dialogs[x].id === msgObj.dialog.id) {
                                    // replace the dialog
                                    index = x;
                                }
                            }

                            // remove the dialog from the list.
                            dialogs.splice(index, 1);

                        }

                        break;
                    case 'notready-reasons':
                        // Got the NotReady Reasons. 
                        if (msgObj.notReadyReasons !== null || msgObj.notReadyReasons !== undefined) {
                            if (msgObj.notReadyReasons.length > 0)
                                // if the list is empty we get an Array object with length of 1, but the 
                                // value is null so check for that. 
                                if (msgObj.notReadyReasons[0] !== null)
                                    notReadyReasons = msgObj.notReadyReasons;
                                else
                                    notReadyReasons = [];
                            else
                                notReadyReasons = [];
                        } else {
                            notReadyReasons = [];
                        }

                        break;
                    case 'signout-reasons':
                        // Got the signout reasons.
                        if (msgObj.signoutReasons !== null || msgObj.signoutReasons !== undefined) {
                            if (msgObj.signoutReasons.length > 0)
                                // if the list is empty we get an Array object with length of 1, but the 
                                // value is null so check for that. 
                                if (msgObj.signoutReasons[0] !== null)
                                    signoutReasons = msgObj.signoutReasons;
                                else
                                    signoutReasons = [];
                            else
                                signoutReasons = [];
                        } else {
                            signoutReasons = [];
                        }
                        break;
                    case 'wrapup-reasons':
                        // Got the Wrapup Reasons.
                        if (msgObj.wrapupReasons !== null || msgObj.wrapupReasons !== undefined) {
                            if (msgObj.wrapupReasons.length > 0)
                                // if the list is empty we get an Array object with length of 1, but the 
                                // value is null so check for that. 
                                if (msgObj.wrapupReasons[0] !== null)
                                    wrapupReasons = msgObj.wrapupReasons;
                                else
                                    wrapupReasons = [];
                            else
                                wrapupReasons = [];
                        } else {
                            wrapupReasons = [];
                        }
                        break;
                    case 'phonebooks':
                        // Got the Phonebooks. 
                        phoneBooks = msgObj.phoneBooks;

                        break;
                    case 'api-error':
                        // Doing nothing with the message internally at this point. Just fire to the client. 
                        break;
                    case 'desktop-status':
                        // Doing nothing with the message internally at this point. Just fire to the client. 
                        break;
                   case 'pong':
                        // Don't fire to the client. 
                        missedHBCounter = 0;
                        return;
                     default:
                        console.log("Received unknown message: " + msgObj);
                }

                // Received a message so reset missed HB Counter.
                missedHBCounter = 0;
                
                
                // Fire the event to listener.
                onEventCallback(msgObj);
            }
        },

        /**
         * @private
         * Gets the Agent's participant object from the dialog provided.
         * @param {Object} dialog
         *     The Dialog object to retrieve the Agent's Participant.
         * @returns {Object} Participant
         *     The Participant object for the Agent.
         */
        _getMyParticipant = function (dialog) {
            let _participants = dialog.participants.Participant;
            //let _participants = dialog.participants;
            
            if (Array.isArray(_participants)) {
                for (var x in _participants) {
                    let _participant = _participants[x];
                    let _mediaAddress = _participant.mediaAddress;
                    let _mediaAddressType = _participant.mediaAddressType;

                    let _agentInstrument = currUserObj.extension;
                    // Check to see if this is the agent's participant
                    if ((_mediaAddress !== undefined && _mediaAddressType !== undefined && _agentInstrument !== undefined) &&
                        (_mediaAddress === _agentInstrument) && (_mediaAddressType === 'AGENT_DEVICE')) {
                        // Okay this is the agent's participant. So return.
                        return _participant;
                    }
                }
            } else {
                // There is only a single participant. 
                let _participant = _participants;
                let _mediaAddress = _participant.mediaAddress;
                let _mediaAddressType = _participant.mediaAddressType;

                let _agentInstrument = currUserObj.extension;
                // Check to see if this is the agent's participant
                if ((_mediaAddress !== undefined && _mediaAddressType !== undefined && _agentInstrument !== undefined) &&
                    (_mediaAddress === _agentInstrument) && (_mediaAddressType === 'AGENT_DEVICE')) {
                    // Okay this is the agent's participant. So return.
                    return _participant;
                }

            }
        },

        /**
         * @private
         * Gets the Active Dialog object from the dialogs collection.
         * @returns {Object} Dialog
         *     The Active Dialog object from the collection.
         */
        _getActiveDialog = function () {

            var activeDialog;

            for (var x in dialogs) {
                // Let's loop the dialog collection looking for the Active Dialog

                if (dialogs[x].state === 'ACTIVE') {
                    activeDialog = dialogs[x];
                }
            }

            return activeDialog;
        },

        /**
         * @private
         * Gets the Agent's participant object from the dialog provided.
         * @param {Object} dialog
         *     The Dialog object to retrieve the Agent's Participant.
         * @returns {Object} Participant
         *     The Participant object for the Agent.
         */
        _getDialogWithId = function (id) {

            var activeDialog;

            for (var x in dialogs) {
                // Let's loop the dialog collection looking for the Active Dialog

                if (dialogs[x].id === id) {
                    activeDialog = dialogs[x];
                }
            }

            return activeDialog;
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to log the agent out, using the reason code provided.
         * 
         * @param {Object} options
         *     Number - options.reasonCodeId (optional)
         *     The id of the Signout Reason Code to use to log the agent out. This field is optional.
         */
        _logout = function (options) {
            options = options || {};
            _send_message({
                messageType: 'user-update',
                state: 'LOGOUT',
                reasonCodeId: options.reasonCodeId
            });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to set the agent to Ready.
         * 
         */
        _ready = function () {
            _send_message({
                messageType: 'user-update',
                state: 'READY'
            });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to set the agent to NotReady, using the reason code provided.
         * 
         * @param {Object} options
         *     Number - options.reasonCodeId (optional)
         *     The id of the NotReady Reason Code to use to set agent state. This field is optional.
         */
        _notReady = function (options) {
            options = options || {};
            _send_message({
                messageType: 'user-update',
                state: 'NOT_READY',
                reasonCodeId: options.reasonCodeId
            });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to set the agent to WorkReady.
         */
        _workReady = function () {
            _send_message({
                messageType: 'user-update',
                state: 'WORK_READY'
            });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to place a call from the agent's device to the number provided.
         * 
         * @param {Object} options
         *     options.numberToDial
         *          String - The number to dial. (required)
         *      options.callvariables (optional)
         *          Array of call varirable objects. 
         */
        _makeCall = function (options) {

            if (options !== undefined) {
                if (options.numberToDial !== undefined) {
                    if (options.callvariables !== undefined) {
                        _send_message({
                            messageType: 'dialog-action',
                            action: 'MAKE_CALL',
                            numberToDial: options.numberToDial,
                            callvariables: options.callvariables
                        });

                    } else {
                        // Call variables were not passed.
                        _send_message({
                            messageType: 'dialog-action',
                            action: 'MAKE_CALL',
                            numberToDial: options.numberToDial
                        });
                    }
                } else {
                    console.log("_makeCall: Error calling MakeCall. Options.numberToDial not provided. ");
                }

            } else {
                console.log("_makeCall: Error calling MakeCall. Options object not provided. ");
            }

        },

        /**
         * @private
         * Sends a message to the IPC Gadget to answer the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         * 
         */
        _answer = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'ANSWER'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to drop the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _drop = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'DROP'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to hold the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _hold = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'HOLD'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to retrieve the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _retrieve = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'RETRIEVE'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to conference the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _conference = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'CONFERENCE'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to transfer the specified Dialog. Can be called passing the DialogId of 
         * a dialog on which to operate. If the dialogId is not passed, the currently selected dialog variable is used,
         * and if the currently selected dialog variable is not set uses the currently active dialog.
         * @param {Object} options
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _transfer = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.dialogId !== undefined) {
                    activeDialog = _getDialogWithId(options.dialogId);
                }
            } else {

                if (currSelectedDialog === undefined)
                    activeDialog = _getActiveDialog();
                else
                    activeDialog = currSelectedDialog;
            }

            if (activeDialog !== undefined)
                _send_message({
                    messageType: 'dialog-action',
                    dialogId: activeDialog.id,
                    action: 'TRANSFER'
                });
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to place a consultation call using the Dialog specified. If the DialogID is not passed,
         * the currently selected dialog variable is used,or the currently active dialog if the selected dialog has not been set.
         *  
         * @param {Object} options
         *     options.numberToDial
         *          String - The number to dial.	 
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _makeConsultCall = function (options) {
            let activeDialog;

            if (options !== undefined) {

                if (options.numberToDial !== undefined) {

                    if (options.dialogId !== undefined) {
                        activeDialog = _getDialogWithId(options.dialogId);
                    } else {

                        if (currSelectedDialog === undefined)
                            activeDialog = _getActiveDialog();
                        else
                            activeDialog = currSelectedDialog;
                    }

                    if (activeDialog !== undefined)
                        _send_message({
                            messageType: 'dialog-action',
                            dialogId: activeDialog.id,
                            action: 'CONSULT_CALL',
                            numberToDial: options.numberToDial
                        });
                } else {
                    console.log("_makeConsultCall: Error options object is undefined.");
                }
            } else {
                console.log("_makeConsultCall: Error options object is undefined.");
            }

        },

        /**
         * @private
         * Sends a message to the IPC Gadget to place a single step (i.e. blind) transfer call using the Dialog specified. If the DialogID is not passed,
         * the currently selected dialog variable is used,or the currently active dialog if the selected dialog has not been set.
         * 
         * @param {Object} options
         *     options.numberToDial
         *          String - The number to dial.	 
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _singleStepTransferCall = function (options) {
            let activeDialog;

            if (options !== undefined) {

                if (options.numberToDial !== undefined) {

                    if (options.dialogId !== undefined) {
                        activeDialog = _getDialogWithId(options.dialogId);
                    } else {

                        if (currSelectedDialog === undefined)
                            activeDialog = _getActiveDialog();
                        else
                            activeDialog = currSelectedDialog;
                    }

                    if (activeDialog !== undefined)
                        _send_message({
                            messageType: 'dialog-action',
                            dialogId: activeDialog.id,
                            action: 'TRANSFER_SST',
                            numberToDial: options.numberToDial
                        });
                } else {
                    console.log("_singleStepTransferCall: Error options object is undefined.");
                }
            } else {
                console.log("_singleStepTransferCall: Error options object is undefined.");
            }

        },

        /**
         * @private
         * Sends a message to the IPC Gadget to updated the call data on the DialogID provided.
         * 
         * @param {Object} options
         *      options.callvariables (required
         *          Array of call varirable objects. 
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _updateCallData = function (options) {
            let activeDialog;

            if (options !== undefined) {
                if (options.callvariables !== undefined) {
                    if (options.dialogId !== undefined) {
                        activeDialog = _getDialogWithId(options.dialogId);
                    } else {

                        if (currSelectedDialog === undefined)
                            activeDialog = _getActiveDialog();
                        else
                            activeDialog = currSelectedDialog;
                    }

                    if (activeDialog !== undefined)
                        _send_message({
                            messageType: 'dialog-update',
                            action: 'UPDATE_CALL_DATA',
                            dialogId: activeDialog.id,
                            callvariables: options.callvariables
                        });

                } else {
                    console.log("_updateCallData: Error CallVariables not provided. ");
                }

            } else {
                console.log("_updateCallData: Error Options object not provided. ");
            }

        },

        /**
         * @private
         * Gets the current Wrapup Mode on Incoming call for user.
         * 
         * @return {String} wrapupMode
         *          The Wrapup Mode for Incoming Calls for this User.
         */
        _getWrapUpModeOnIncoming = function () {
            let wrapupModeOnIncoming;

            wrapupModeOnIncoming = currUserObj.settings.wrapUpOnIncoming;

            return wrapupModeOnIncoming;
        },

        /**
         * @private
         * Sends a message to the IPC Gadget to updated the wraupup reason on the DialogID provided.
         * 
         * @param {Object} options
         *      options.wrapupReason (required)
         *          Array of call varirable objects. 
         *     options.dialogId 
         *          Number - (optional) the id of the dialog on which to operate.
         */
        _updateWrapUpReason = function (options) {
            let activeDialog;
            if (options !== undefined) {
                if (options.wrapupReason !== undefined) {
                    if (options.dialogId !== undefined) {
                        activeDialog = _getDialogWithId(options.dialogId);
                    } else {

                        if (currSelectedDialog === undefined)
                            activeDialog = _getActiveDialog();
                        else
                            activeDialog = currSelectedDialog;
                    }

                    if (activeDialog !== undefined)
                        _send_message({
                            messageType: 'dialog-update',
                            action: 'UPDATE_WRAPUP_REASON',
                            dialogId: activeDialog.id,
                            wrapupReason: options.wrapupReason
                        });

                } else {
                    console.log("_updateWrapUpReason: Error wrapupReason not provided. ");
                }

            } else {
                console.log("_updateWrapUpReason: Error Options object not provided. ");
            }

        },

        /**
         * @private
         * Sends a message to the IPC Gadget to place a consultation call from the currently selected dialog,
         * or the currently active dialog if the selected dialog has not been set to the number provided.
         * 
         * @param {Object} message
         *     The JSON object to send to the IPC Gadget. It is string.
         */
        _send_message = function (message) {
            if (typeof (localStorage) != "undefined") {
                localStorage.setItem('messageToFinesse', JSON.stringify(message));
                localStorage.removeItem('messageToFinesse');
            }
        },
        
        /**
         * @private
         * Sends a heartbeat/ping message to the IPC Gadget to determine if the LocalStorage communication channel is up
         * and the Finesse IPC gadget is healthy. 
         */
        _handleHeartbeatMsg = function() {
            // Lets check to see if have exceeded the missed Heartbeat Count.
            if (missedHBCounter >= 3)
            {
                 console.log("Missed 3 heartbeats in a row. Firing event to client.");
                let msgObj = {
                    messageType: "connection-status",
                    dateTimeStamp: Date.now(),
                    connectionStatus: "Missed-Heartbeats"
                };
                
               // Fire the event to listener.
                onEventCallback(msgObj);
                
                // Stop the timer and reset everything. 
                				
				// Reset the missed heartbeat counter.
				missedHBCounter = 0;
			
				// Clear the Heartbeat Timer.
				if (heartbeatTimer !== undefined)
				{ 
					// Stop the existing timer
					clearInterval(heartbeatTimer);

                    // Set the heartbeatTimer funcion to undefined. 
                    heartbeatTimer = undefined;

				}

                return;
            }
            else if (missedHBCounter > 0)
            {
                console.log("We have missed " + missedHBCounter + " heartbeats in a row.");
            }          
             _send_message({
                            messageType: 'ping',
                            dateTimeStamp: Date.now()
                        });
            // bump the heartbeat counter. 
            missedHBCounter++;
        };

    /** @scope cadi.modules.FinesseIPCLSAPI */
    return {

        /**
         * Public API. 
         * Calls the corresponding Private function, except were indicated.
         */

        /**
         * @public
         * Gets the Current User Object from memory. 
         */
        getCurrUserObj: function () {
            return currUserObj;
        },

        /**
         * @public
         * Gets the Dialog Object collection for the User from memory. 
         */
        getDialogs: function () {
            return dialogs;
        },

        /**
         * @public
         * Gets the currently selected Dialog object from memory.
         * This is used by the client applicaiton to have the API keep track of which 
         * Dialog is currently selected (i.e. currently being operated on). The client applicaiton
         * will set the Selected Dialog when a dialog is selected from a list/grid of dialogs. Then 
         * when an operation is performed, the API will use the Selected Dialog to perform the action.
         */
        getCurrSelectedDialog: function () {
            return currSelectedDialog;
        },

        /**
         * @public
         * Sets the currently selected Dialog object from memory.
         * This is used by the client applicaiton to have the API keep track of which 
         * Dialog is currently selected (i.e. currently being operated on). The client applicaiton
         * will set the Selected Dialog when a dialog is selected from a list/grid of dialogs. Then 
         * when an operation is performed, the API will use the Selected Dialog to perform the action.
         */
        setCurrSelectedDialog: function (dialog) {
            currSelectedDialog = dialog;
        },

        /**
         * @public
         * Gets the NotReady Reason Code object collection for the user from memory.
         */
        getNotReadyReasons: function () {
            return notReadyReasons;
        },

        /**
         * @public
         * Gets the Signout Reason Code object collection for the user from memory.
         */
        getSignoutReasons: function () {
            return signoutReasons;
        },

        /**
         * @public
         * Gets the Phone Boosk object collection for the user from memory.
         */
        getPhoneBooks: function () {
            return phoneBooks;
        },

        /**
         * @public
         * Gets the Wrapup Reason Code object collection for the user from memory.
         */
        getWrapupReasons: function () {
            return wrapupReasons;
        },

        /**
         * @public
         * Calls the corresponding Private function.
         */
        getMyParticipant: _getMyParticipant,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        getDialogWithId: _getDialogWithId,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        getActiveDialog: _getActiveDialog,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        logout: _logout,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        ready: _ready,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        notReady: _notReady,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        workReady: _workReady,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        makeCall: _makeCall,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        answer: _answer,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        drop: _drop,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        hold: _hold,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        retrieve: _retrieve,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        makeConsultCall: _makeConsultCall,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        conference: _conference,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        transfer: _transfer,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        singleStepTransferCall: _singleStepTransferCall,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        updateCallData: _updateCallData,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        getWrapUpModeOnIncoming: _getWrapUpModeOnIncoming,

        /**
         * @public
         * Calls the corresponding Private function.
         */
        updateWrapUpReason: _updateWrapUpReason,

        /**
         * @public
         * The init function initializes the event handler for the API. 
         * @param {function} onEventCallBack
         *     The Callback that will be called when an event is received. 
         */
        init: function (_onEventCallback) {

            onEventCallback = _onEventCallback;

            // add listener for messages from the proxy web page on Local Storage
            window.addEventListener("storage", _lsMsgReceiver, false);

            // Get the current user object. 
            _send_message({
                messageType: 'get-user'
            });

            // Get the current user dialogs if any. 
            _send_message({
                messageType: 'get-dialogs'
            });
            
        }
    };
}());
