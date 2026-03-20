# agentflow

Idioma: Español | [English](README.md)

`agentflow` es una CLI de Node.js que configura un flujo de desarrollo
multiagente para Claude Code, Cowork, Codex CLI, Codex App y OpenCode.

Genera cuatro agentes especializados:

- planner
- implementer
- tester
- documenter

La lógica de orquestación vive en la skill generada `agentflow` para Claude y
Codex. OpenCode recibe las definiciones de agentes para ejecución manual.

## Instalar la CLI

Instala `agentflow` globalmente una vez:

```bash
npm install -g agentflow
```

Luego, dentro de cada proyecto donde quieras usar el flujo:

```bash
cd my-project
```

## Comandos

```bash
agentflow init
agentflow status
agentflow update
agentflow config
agentflow eject
```

## Qué agrega v3

- El planner puede escribir artefactos de features y solo puede escribir `docs/features/<slug>/plan.md` y `docs/features/<slug>/review.md`.
- Los planes ahora separan `## Implementation Tasks`, `## Test Tasks` y `## Test Files`.
- Las skills generadas mantienen `docs/features/<slug>/activity.log` y hacen pausa limpia con `PAUSED_RATE_LIMIT`, incluyendo instrucciones para reanudar.
- `agentflow status` reporta `Template Health` (`healthy`, `stale` o `incompatible`) a partir de los archivos generados en disco, no solo desde `.agentflow.json`.
- `agentflow update` reescribe archivos gestionados cuando las plantillas están desactualizadas, preservando modelos personalizados y contenido fusionado por marcadores.

## Inicialización: qué comando usar en cada caso

### Caso 1: proyecto nuevo o proyecto que nunca usó agentflow

Ejecuta:

```bash
agentflow init
```

Úsalo cuando:

- no existe `.agentflow.json`
- quieres que `agentflow` genere los agentes por primera vez
- quieres seleccionar herramientas, modelos, idioma, framework y test runner

### Caso 2: proyecto ya inicializado con agentflow

Ejecuta:

```bash
agentflow status
agentflow update
agentflow status
```

Úsalo cuando:

- el proyecto ya tiene `.agentflow.json`
- quieres migrar prompts o plantillas antiguas a la versión más reciente
- quieres verificar si los archivos generados están `healthy`, `stale` o `incompatible`

Ese es el flujo correcto para probar migraciones. No vuelvas a ejecutar `init`
a menos que realmente quieras reinicializar el proyecto.

### Caso 3: el proyecto ya tiene configuración de Claude/Codex/OpenCode, pero no agentflow

Ejecuta:

```bash
agentflow init
```

Durante `init`, `agentflow` fusionará contenido en:

- `CLAUDE.md`
- `AGENTS.md`
- `opencode.json`
- `.codex/config.toml`

y generará los archivos de agentes que administra.

### Caso 4: el proyecto fue inicializado, pero `status` muestra `incompatible`

Empieza con:

```bash
agentflow status
agentflow update
```

Si `incompatible` sigue apareciendo, es probable que al proyecto le falten
archivos o tenga archivos no gestionados. En ese caso, volver a ejecutar
`agentflow init` es la vía de recuperación más simple.

## Qué genera `agentflow init`

Depende de las herramientas seleccionadas:

- Claude Code / Cowork:
  - `.claude/skills/agentflow/SKILL.md`
  - `.claude/agents/planner.md`
  - `.claude/agents/implementer.md`
  - `.claude/agents/tester.md`
  - `.claude/agents/documenter.md`
  - sección de workflow en `CLAUDE.md`
- Codex CLI / Codex App:
  - `.codex/agents/planner.toml`
  - `.codex/agents/implementer.toml`
  - `.codex/agents/tester.toml`
  - `.codex/agents/documenter.toml`
  - `.agents/skills/agentflow/SKILL.md`
  - sección de workflow en `AGENTS.md`
- OpenCode:
  - `.opencode/agents/planner.md`
  - `.opencode/agents/implementer.md`
  - `.opencode/agents/tester.md`
  - `.opencode/agents/documenter.md`
  - sección `agents` fusionada en `opencode.json`

También crea `.agentflow.json` y el directorio base `docs/`.

## Uso diario

### Modo automático

Usa el modo automático cuando la herramienta soporte la skill generada
`agentflow`.

- Claude Code / Cowork:

```text
/agentflow <describe tu feature>
```

- Codex CLI / Codex App:

```text
$agentflow <describe tu feature>
```

El modo automático ejecuta toda la tubería:

1. planner escribe `docs/features/<slug>/plan.md`
2. el usuario aprueba o pide cambios
3. implementer ejecuta `## Implementation Tasks`
4. planner revisa y escribe `docs/features/<slug>/review.md`
5. tester ejecuta `## Test Tasks` y escribe tests a partir de `## Test Files`
6. documenter actualiza la documentación cuando los tests pasan

### Modo manual

Usa el modo manual cuando:

- quieres ejecutar una fase a la vez
- estás depurando el workflow
- estás usando OpenCode

#### Claude Code / Cowork

Ejecuta los agentes directamente:

```text
@agent-planner plan: <feature>
@agent-implementer implement docs/features/<slug>/plan.md
@agent-planner review against docs/features/<slug>/plan.md
@agent-tester write and run tests
@agent-documenter write documentation
```

#### Codex CLI / Codex App

Pídele a Codex que lance los agentes por nombre:

```text
Spawn the planner agent to plan: <feature>
Spawn the implementer agent to implement docs/features/<slug>/plan.md
Spawn the planner agent to review against docs/features/<slug>/plan.md
Spawn the tester agent to write and run tests
Spawn the documenter agent to write documentation
```

#### OpenCode

En este repo, OpenCode es solo manual. Usa los agentes generados por nombre:

```text
@planner
@implementer
@tester
@documenter
```

Luego dale a cada uno la tarea correspondiente para la fase que quieras correr.

## Qué decirle a cada agente

Estas son las formas de tarea esperadas cuando ejecutas agentes manualmente.

### Planner: crear un plan

Úsalo cuando la feature todavía no ha sido planificada.

```text
Plan this feature and write the result to docs/features/<slug>/plan.md.
The plan must include:
- ## Summary
- ## Implementation Tasks
- ## Test Tasks
- ## Test Files
- ## Acceptance Criteria
Feature: <your feature request>
```

### Implementer: ejecutar el plan

Úsalo después de que el plan haya sido aprobado.

```text
Read docs/features/<slug>/plan.md and execute only ## Implementation Tasks.
Ignore ## Test Tasks.
Mark completed implementation tasks with [x].
```

### Planner: revisar la implementación

Úsalo después de implementar o después de aplicar fixes.

```text
Review the implementation against docs/features/<slug>/plan.md.
Check only ## Implementation Tasks and ## Acceptance Criteria for this phase.
Do not mark ## Test Tasks as missing before testing starts.
Write results to docs/features/<slug>/review.md starting with:
## Status: APPROVED | NEEDS_CHANGES
```

### Tester: escribir y ejecutar tests

Úsalo después de que la implementación pase la revisión.

```text
Read docs/features/<slug>/plan.md.
Execute only ## Test Tasks.
Create only the files listed in ## Test Files.
Write and run tests with the configured test command.
If tests fail, update docs/features/<slug>/review.md with:
## Status: NEEDS_CHANGES
## Test Failures
```

### Documenter: actualizar documentación

Úsalo solo después de que los tests pasen.

```text
Read docs/features/<slug>/plan.md and the final implementation.
Update README.md and any relevant docs to match the approved, tested behavior.
```

## Estado de las plantillas

`agentflow status` valida los archivos generados del planner, tester y las
skills contra las invariantes del workflow:

- el planner solo puede escribir artefactos de features
- las skills usan `docs/features/<slug>/` y `activity.log`
- el tester sigue `## Test Tasks` y `## Test Files`

Si un archivo gestionado existe pero no cumple las invariantes de v3, se
reporta como `stale`.

Si falta un archivo requerido o ya no es gestionado por `agentflow`, se reporta
como `incompatible`.

## Flujo de mantenimiento recomendado

Usa estos comandos en este orden:

```bash
agentflow status
agentflow update
agentflow status
```

Eso te da:

- un reporte de salud antes de cambiar nada
- migración de archivos gestionados si están `stale` o desactualizados
- una confirmación final de que el proyecto está sano
