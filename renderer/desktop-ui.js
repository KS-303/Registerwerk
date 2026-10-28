(() => {
  'use strict';
  const bridge = window.registerwerkDesktop;
  if (!bridge) return;
  document.querySelector('.brand p').textContent = 'Modbus RTU · Windows-App';
  document.querySelector('#help-connection > p').textContent = 'Die Windows-App bringt ihre Browserumgebung bereits mit. USB-RS485-Adapter anschließen, passende Verbindungseinstellungen wählen und den gewünschten COM-Port in der Portauswahl freigeben.';
  document.querySelector('.help-steps li:nth-child(4) p').textContent = 'USB-RS485-Adapter anschließen, „Port auswählen und verbinden“ wählen und den passenden COM-Port auswählen. Es wird kein Adapter automatisch ausgewählt.';
  const veil = document.createElement('div');
  veil.className = 'veil';
  veil.id = 'desktopPortDialog';
  veil.innerHTML = '<div class="dialog port-dialog" role="dialog" aria-modal="true" aria-labelledby="desktopPortTitle"><h3 id="desktopPortTitle">COM-Port auswählen</h3><p>Den Adapter wählen, an dem der Modbus-Bus angeschlossen ist.</p><div class="port-list" id="desktopPortList" role="radiogroup" aria-label="Serielle Ports"></div><p class="hint" id="desktopPortHint" role="status" aria-live="polite"></p><div class="dialog-actions"><button class="btn" id="desktopPortCancel" type="button">Abbrechen</button><button class="btn primary" id="desktopPortConnect" type="button" disabled>Verbinden</button></div></div>';
  document.body.appendChild(veil);
  const list = veil.querySelector('#desktopPortList'), connect = veil.querySelector('#desktopPortConnect'),
    cancel = veil.querySelector('#desktopPortCancel'), hint = veil.querySelector('#desktopPortHint');
  let active = null, selected = '', returnFocus = null, sending = false;
  const hide = () => {
    veil.classList.remove('show');
    active = null; selected = ''; sending = false;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  };
  const choose = async (portId) => {
    if (!active || sending) return;
    const requestId = active.requestId;
    sending = true;
    connect.disabled = cancel.disabled = true;
    try {
      const result = await bridge.selectPort(requestId, portId);
      if (!result.ok && active?.requestId === requestId) {
        hint.textContent = 'Die Auswahl ist nicht mehr verfügbar. Port erneut auswählen.';
        sending = false; cancel.disabled = false; connect.disabled = !selected;
      }
    } catch {
      hint.textContent = 'Portauswahl fehlgeschlagen. Auswahl abbrechen und erneut versuchen.';
      sending = false; cancel.disabled = false; connect.disabled = !selected;
    }
  };
  bridge.onPorts((payload) => {
    if (!payload) { hide(); return; }
    const opened = !active || active.requestId !== payload.requestId;
    const focusedId = document.activeElement?.dataset?.portId;
    const focusInList = list.contains(document.activeElement);
    if (opened) { returnFocus = document.activeElement; selected = ''; sending = false; }
    active = payload;
    if (!payload.ports.some((port) => port.portId === selected)) selected = '';
    list.replaceChildren();
    for (const port of payload.ports) {
      const label = document.createElement('label'); label.className = 'port-option';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'registerwerk-port';
      radio.value = port.portId; radio.dataset.portId = port.portId; radio.checked = selected === port.portId;
      const text = document.createElement('span');
      const title = document.createElement('strong'); title.textContent = port.portName || port.displayName || 'Serieller Port';
      const sub = document.createElement('small');
      sub.textContent = [port.displayName, port.vendorId ? 'USB ' + port.vendorId + ':' + port.productId : ''].filter(Boolean).join(' · ');
      text.append(title, sub); label.append(radio, text); list.append(label);
      radio.addEventListener('change', () => { selected = radio.value; connect.disabled = sending; });
    }
    connect.disabled = sending || !selected; cancel.disabled = sending;
    hint.textContent = payload.ports.length ? 'Angeschlossene oder entfernte Adapter werden während der Auswahl aktualisiert.' : 'Kein serieller Port gefunden. Adapter anschließen und gegebenenfalls Treiber prüfen. Die Liste aktualisiert sich automatisch.';
    veil.classList.add('show');
    if (opened) cancel.focus();
    else if (focusInList) {
      const radio = [...list.querySelectorAll('input')].find((item) => item.dataset.portId === focusedId);
      (radio || cancel).focus();
    }
  });
  cancel.addEventListener('click', () => choose(''));
  connect.addEventListener('click', () => { if (selected) choose(selected); });
  veil.addEventListener('click', (event) => { if (event.target === veil) choose(''); });
  document.addEventListener('keydown', (event) => {
    if (!veil.classList.contains('show')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); choose('');
    } else if (event.key === 'F1') {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
})();
