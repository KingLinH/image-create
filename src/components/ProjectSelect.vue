<script setup lang="ts">
import { useProjectsStore } from "@/stores/projects";

const projects = useProjectsStore();

function onChange(value: string) {
  projects.current = value;
  if (value.trim()) projects.ensure(value);
}
</script>

<template>
  <el-select
    :model-value="projects.current"
    placeholder="归属项目（可选）"
    allow-create
    filterable
    clearable
    size="small"
    style="width: 200px"
    @change="onChange"
  >
    <el-option v-for="p in projects.known" :key="p" :label="p" :value="p" />
  </el-select>
</template>
