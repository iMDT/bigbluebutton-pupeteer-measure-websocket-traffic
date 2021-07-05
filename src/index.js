const puppeteer = require('puppeteer');

function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }

 async function screenshot(page) {
     const ts = new Date().getTime();
    await page.screenshot({path: `/tmp/bla-${ts}.png`});
}

const selectors = {
    close_audio: `button[aria-label='Close Join audio modal']`,
    chat_message: `p[data-test="chatUserMessageText"]`,
    send_message_button: `button[aria-label="Send message"]`,
};

const measurerBrowser = (async () => {
    try {
        let totalWebsocketBytes = 0, totalWebsocketMBytes=0;
        const {argv} = process;
        const JOIN_URL=argv[2];
        const TOTAL_MESSAGES=argv[3] || 0; // total messages that bomber will send ( must match with bomber config )

        if(!JOIN_URL) {
            throw Error("Missing join URL");
        }

        const browser = await puppeteer.launch({
            args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });

        const handleWebSocketFrameReceived = (params) => {
            const payload = params.response.payloadData;
            totalWebsocketBytes += payload.length;
            
            totalWebsocketMBytes = Math.round(totalWebsocketBytes / 1024 / 1024 * 100) / 100;
          }

        const page = await browser.newPage();
        f12 = await page.target().createCDPSession();
        await f12.send('Network.enable');
        await f12.send('Page.enable');

        f12.on('Network.webSocketFrameReceived', handleWebSocketFrameReceived);

        const waitForMessage = () => {
            return new Promise ( (res, rej) => {
                const checkForMessage = async () => {
                    const found = await page.evaluate ( ({selectors, TOTAL_MESSAGES}) => {
                        try {
                            const userMessages = [ ... document.querySelectorAll(selectors.chat_message) ];
                            return userMessages.filter( p => p.innerText.includes(`msgNum: ${TOTAL_MESSAGES}`) ).length > 0;
                        } catch (e) {
                            return false;
                        }
                    }, {selectors, TOTAL_MESSAGES});

                    // await screenshot(page);

                    if(found) {
                        res();
                    } else {
                        console.log(`Last message ( ${TOTAL_MESSAGES} ) not yet received... `);
                        setTimeout(checkForMessage, 1000);
                    }
                };
                return checkForMessage();
            });
        };

        await page.goto(JOIN_URL);

        // Wait for audio modal
        console.log('Wait for audio modal');
        await page.waitForSelector(selectors.close_audio);
        console.log(`Audio modal detected. Total websocket traffic: ${totalWebsocketMBytes}`);

        // Close audio modal
        console.log('Click on close audio modal');
        await page.click(selectors.close_audio);

        screenshot(page);

        if(TOTAL_MESSAGES>0) {
            console.log('Fill input');
            await page.type('#message-input', 'Go!', {delay: 200}) 
            console.log('Hit enter');
            await page.keyboard.press(String.fromCharCode(13));
        
            // Wait until last bomber message
            await waitForMessage();
            console.log(`Last bomber message ${TOTAL_MESSAGES} detected. Total websocket traffic: ${totalWebsocketMBytes}`);
        }

        console.log("Exiting");
        process.exit(0);
    } catch (e) {
        console.log("ERROR: " , e.message);
        process.exit(1);
    }
});


measurerBrowser();