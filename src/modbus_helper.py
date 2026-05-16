import sys
import json
import time
from pymodbus.client import ModbusTcpClient
from pymodbus.framer import FramerType

def read_block(client, func, start, count, slave):
    all_regs = []
    block_size = 30
    for i in range(0, count, block_size):
        current_count = min(block_size, count - i)
        res = func(address=start + i, count=current_count, slave=slave)
        if res.isError():
            return None
        all_regs.extend(res.registers)
        time.sleep(0.05) # Tiny delay between blocks
    return all_regs

def run_modbus():
    if len(sys.argv) < 5:
        print(json.dumps({'error': 'Missing arguments'}))
        return

    ip = sys.argv[1]
    port = int(sys.argv[2])
    slave_id = int(sys.argv[3])
    action = sys.argv[4]

    client = ModbusTcpClient(ip, port=port, timeout=5, framer=FramerType.RTU)
    if not client.connect():
        print(json.dumps({'error': 'Connection failed'}))
        return

    try:
        if action == 'read':
            inputs = read_block(client, client.read_input_registers, 0, 100, slave_id)
            holdings = read_block(client, client.read_holding_registers, 0, 100, slave_id)
            holdings_high = read_block(client, client.read_holding_registers, 1000, 10, slave_id)

            print(json.dumps({
                'input': inputs if inputs else [],
                'holding': holdings if holdings else [],
                'holding_high': holdings_high if holdings_high else []
            }))
            
        elif action == 'write':
            addr = int(sys.argv[5])
            val = int(sys.argv[6])
            write_res = client.write_register(address=addr, value=val, slave=slave_id)
                
            if write_res.isError():
                print(json.dumps({'error': str(write_res)}))
            else:
                print(json.dumps({'success': True, 'address': addr, 'value': val}))

    except Exception as e:
        print(json.dumps({'error': str(e)}))
    finally:
        client.close()

if __name__ == '__main__':
    run_modbus()
