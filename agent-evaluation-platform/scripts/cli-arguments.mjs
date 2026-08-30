export function wantsHelp(args) {
  return args.includes('--help') || args.includes('-h');
}

export function validateArguments(args, { valueOptions = [], flags = [], maxPositionals = Infinity } = {}) {
  const options = new Set(valueOptions);
  const switches = new Set([...flags, '--help', '-h']);
  let positionals = 0;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith('-')) {
      positionals++;
      if (positionals > maxPositionals) throw new Error(`Unexpected positional argument: ${argument}`);
      continue;
    }
    const [name, inlineValue] = argument.split('=', 2);
    if (switches.has(name)) {
      if (inlineValue !== undefined) throw new Error(`${name} does not accept a value`);
      continue;
    }
    if (!options.has(name)) throw new Error(`Unknown option: ${name}`);
    if (inlineValue !== undefined) {
      if (!inlineValue) throw new Error(`Missing value for ${name}`);
      continue;
    }
    const value = args[++index];
    if (!value || (value.startsWith('-') && value !== '-')) throw new Error(`Missing value for ${name}`);
  }
}

export function showHelp(help, error) {
  const stream = error ? process.stderr : process.stdout;
  if (error) stream.write(`Error: ${error}\n\n`);
  stream.write(`${help.trim()}\n`);
  process.exit(error ? 2 : 0);
}
