/* ==========================================
   DERIV AUTO TRADER
   Stage 1: Account connection and dashboard
   ========================================== */

"use strict";

const $ = (id) => document.getElementById(id);
const DERIV_APP_ID = "34D2hxr9Xo2babiK8miih";
let derivSocket = null;
let requestCounter = 1;
let connected = false;
let authorized = false;
let botRunning = false;
let accountCurrency = "USD";
let accountBalance = null;

const pendingRequests = new Map();

function setMessage(id, message) {
    const element = $(id);
    if (element) element.textContent = message;
}

function setConnectionStatus(message) {
    setMessage("connectionStatus", message);
}

function sendRequest(payload) {
    return new Promise((resolve, reject) => {
        if (!derivSocket || derivSocket.readyState !== WebSocket.OPEN) {
            reject(new Error("Not connected to Deriv."));
            return;
        }

        const reqId = requestCounter++;
        payload.req_id = reqId;

        const timer = setTimeout(() => {
            pendingRequests.delete(reqId);
            reject(new Error("Deriv did not respond in time."));
        }, 15000);

        pendingRequests.set(reqId, {
            resolve,
            reject,
            timer
        });

        derivSocket.send(JSON.stringify(payload));
    });
}

function handleMessage(event) {
    let data;

    try {
        data = JSON.parse(event.data);
    } catch {
        return;
    }

    if (data.error) {
        const request = pendingRequests.get(data.req_id);

        if (request) {
            clearTimeout(request.timer);
            pendingRequests.delete(data.req_id);
            request.reject(new Error(data.error.message));
        } else {
            console.error("Deriv error:", data.error.message);
        }

        return;
    }

    if (data.req_id && pendingRequests.has(data.req_id)) {
        const request = pendingRequests.get(data.req_id);

        clearTimeout(request.timer);
        pendingRequests.delete(data.req_id);
        request.resolve(data);
    }

    if (data.msg_type === "balance" && data.balance) {
        updateBalance(data.balance);
    }
}

function updateBalance(balance) {
    accountBalance = Number(balance.balance);
    accountCurrency = balance.currency || accountCurrency;

    setMessage(
        "balance",
        `${accountCurrency} ${accountBalance.toFixed(2)}`
    );

    setMessage("currency", "Connected account");
}

function updateButtons() {
    if ($("connectBtn")) {
        $("connectBtn").disabled = connected;
    }

    if ($("disconnectBtn")) {
        $("disconnectBtn").disabled = !connected;
    }

    // Trading remains disabled until the engine is implemented.
    if ($("startBtn")) {
        $("startBtn").disabled = true;
    }

    if ($("pauseBtn")) {
        $("pauseBtn").disabled = true;
    }

    if ($("stopBtn")) {
        $("stopBtn").disabled = true;
    }
}

async function connectToDeriv() {
    if (connected) return;

    const token = $("apiToken").value.trim();

    if (!token) {
        setMessage(
            "connectionMessage",
            "Enter your Deriv DEMO API token first."
        );
        return;
    }

    setMessage("connectionMessage", "Connecting to Deriv...");
    setConnectionStatus("Connecting");

    try {
        // Legacy WebSocket API endpoint.
        // The token must have read access for this connection test.
        derivSocket = new WebSocket(
    `wss://ws.derivws.com/websockets/v3?app_id=${34D2hxr9Xo2babiK8miih}`
);

        derivSocket.onmessage = handleMessage;

        derivSocket.onopen = async () => {
            try {
                const response = await sendRequest({
                    authorize: token
                });

                if (!response.authorize) {
                    throw new Error("Account authorization failed.");
                }

                const account = response.authorize;

                // Do not proceed with trading on a real-money account.
                if (Number(account.is_virtual) !== 1) {
                    setMessage(
                        "connectionMessage",
                        "Real-money account detected. This starter bot " +
                        "only permits demo accounts. Disconnect and use " +
                        "a DEMO API token."
                    );

                    disconnectFromDeriv();
                    return;
                }

                connected = true;
                authorized = true;

                accountCurrency = account.currency || "USD";

                setConnectionStatus("Demo Connected");

                setMessage(
                    "connectionMessage",
                    `Connected to demo account ${account.loginid}.`
                );

                setMessage(
                    "balance",
                    `${accountCurrency} ${Number(account.balance).toFixed(2)}`
                );

                setMessage("currency", "Demo account");

                try {
                    const balanceResponse = await sendRequest({
                        balance: 1,
                        subscribe: 1
                    });

                    if (balanceResponse.balance) {
                        updateBalance(balanceResponse.balance);
                    }
                } catch (balanceError) {
                    console.warn(
                        "Balance subscription:",
                        balanceError.message
                    );
                }

                updateButtons();

                setMessage(
                    "botStatus",
                    "Demo connected. Trading engine is not enabled yet."
                );
            } catch (error) {
                setMessage(
                    "connectionMessage",
                    "Connection failed: " + error.message
                );

                disconnectFromDeriv();
            }
        };

        derivSocket.onerror = (event) => {
    console.error("Deriv WebSocket error:", event);

    setMessage(
        "connectionMessage",
        "WebSocket connection failed. Check the App ID, " +
        "internet connection, and browser console."
    );

    setConnectionStatus("Connection Error");
};
            setConnectionStatus("Connection Error");
        };

        derivSocket.onclose = () => {
            connected = false;
            authorized = false;
            derivSocket = null;

            for (const [id, request] of pendingRequests) {
                clearTimeout(request.timer);
                request.reject(new Error("Connection closed."));
                pendingRequests.delete(id);
            }

            setConnectionStatus("Disconnected");
            updateButtons();
        };
    } catch (error) {
        setMessage(
            "connectionMessage",
            "Unable to connect: " + error.message
        );

        setConnectionStatus("Disconnected");
    }
}

function disconnectFromDeriv() {
    botRunning = false;
    connected = false;
    authorized = false;

    if (derivSocket) {
        const socket = derivSocket;
        derivSocket = null;

        if (
            socket.readyState === WebSocket.OPEN ||
            socket.readyState === WebSocket.CONNECTING
        ) {
            socket.close();
        }
    }

    setConnectionStatus("Disconnected");

    setMessage(
        "connectionMessage",
        "Disconnected from Deriv."
    );

    setMessage("balance", "—");
    setMessage("currency", "Demo account");

    updateButtons();
}

function updateStrategyOptions() {
    const strategy = $("strategy").value;
    const direction = $("direction");

    if (strategy === "RISE_EQUAL_FALL_EQUAL") {
        direction.options[0].textContent = "Rise Equals";
        direction.options[0].value = "CALLE";

        direction.options[1].textContent = "Fall Equals";
        direction.options[1].value = "PUTE";
    } else {
        direction.options[0].textContent = "Rise";
        direction.options[0].value = "CALL";

        direction.options[1].textContent = "Fall";
        direction.options[1].value = "PUT";
    }
}

function showTradingNotReady() {
    setMessage(
        "botStatus",
        "Trading engine not enabled. Connect your demo account " +
        "and wait for the trading engine to be implemented and tested."
    );
}

function initializeApp() {
    updateStrategyOptions();
    updateButtons();

    $("connectBtn").addEventListener("click", connectToDeriv);

    $("disconnectBtn").addEventListener(
        "click",
        disconnectFromDeriv
    );

    $("strategy").addEventListener(
        "change",
        updateStrategyOptions
    );

    $("startBtn").addEventListener(
        "click",
        showTradingNotReady
    );

    $("pauseBtn").addEventListener(
        "click",
        showTradingNotReady
    );

    $("stopBtn").addEventListener(
        "click",
        showTradingNotReady
    );

    window.addEventListener("beforeunload", () => {
        if (derivSocket) derivSocket.close();
    });
}

initializeApp();
