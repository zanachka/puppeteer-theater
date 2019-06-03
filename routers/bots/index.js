const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs-extra');
const express = require('express');

const router = express.Router();

const BOTS = (() => fs.readdirSync(path.join(__dirname, './bots'))
  .filter(n => /^[a-z-0-9]+\.js$/.test(n))
  // eslint-disable-next-line global-require, import/no-dynamic-require
  .map(n => require(path.join(__dirname, 'bots', n)))
  .reduce((p, c) => { p[c.name] = c; return p; }, {}))();


  /**
   * basic boilerplate for running bots in browser
   */
router.get('/run', async (req, res, next) => {
  try {
    let html = `<script src="https://code.jquery.com/jquery-3.1.1.min.js"></script><script>
      function parseData(botName) {
        return data => {
          console.log('data', data)
          let images = []
          let $result = $('#' + botName + '-result').empty()
          for (let key of Object.keys(data)) {
            if (key === 'screenshots') {
              images = data[key].
              map(ss => 'data:' + ss.mime + ';base64,' + ss.buffer).
              map(src => $('<img/>').attr('src', src))
            } else if (key === 'content') {
              $('#' + botName + '-content').attr('src', 'data:text/html;base64,' + btoa(unescape(encodeURIComponent(data[key]))));
            } else {
              $result.append('<p>' + key + ': ' + JSON.stringify(data[key]) + '</p>')
            }
          }
          console.log(images)
          $result.append(images)
        }
      }

      function run(botName) {
        $('#' + botName + '-result').empty()
        try {
          let data = JSON.stringify(JSON.parse($('#' + botName + '-body').val()))
          $.ajax({
            url: '/bots/' + botName + '/run',
            method: 'post',
            contentType: 'application/json',
            data,
            dataType: 'json',
            success: parseData(botName),
            error: err => {
              try {
                let json = JSON.parse(err.responseText)
                if (json) {
                  return parseData(botName)(json)
                }
              } catch (e) {
                throw e
              }
              alert('err ' + err.status + ' - ' + err.responseText)
              throw err
            }
          })
        } catch (e) {
          alert(e.stack)
          throw e
        }
      }
    </script>`;

    // eslint-disable-next-line no-restricted-syntax
    for (const botName of Object.keys(BOTS)) {
      html += `
        <div>
          <h3>${botName}</h3>
          body: <textarea style="font-size:20pt" id="${botName}-body">{}</textarea>
          <button className="btn btn-default btn-lg" onclick="run('${botName}')">run</button>
          <div id="${botName}-result"></div>
          <iframe id="${botName}-content" style="width: 1920px;height: 1080px;" sandbox></iframe>
        </div>
      `;
    }
    res.send(html);
  } catch (e) {
    return next(e);
  }
});

Object.keys(BOTS).forEach((botName) => {
  const bot = BOTS[botName];

  if (!bot.router) Object.assign(bot, { router: express.Router() });
  router.use(`/${botName}`, bot.router);

  bot.router.post('/run', bodyParser.json({ limit: '20mB' }), async (req, res, next) => {
    req.setTimeout(60 * 1000 * 60);
    try {
      const result = await bot.run(req.body);
      return res.send(result);
    } catch (e) {
      try {
        console.error(e);
        let code = parseInt(e.code || 500, 10);
        // eslint-disable-next-line no-restricted-globals
        if (!isFinite(code) || code < 100 || code > 999) {
          code = 500;
        }
        return res.status(code).send({
          message: e.message,
          status: e.status,
        });
      } catch (err) {
        return next(err);
      }
    }
  });
});

module.exports = router;
