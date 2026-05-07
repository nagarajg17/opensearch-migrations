package org.opensearch.migrations.transform.shim;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SolrSchemaProviderTest {

    @TempDir
    Path tempDir;

    // ─── Basic field resolution — class ──────────────────────────────────────

    @Test
    void resolvesWellKnownTextFieldToTextFieldClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='text_general' class='solr.TextField'/>",
            "<field name='title' type='text_general'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.TextField", result.get("title").get("class"));
    }

    @Test
    void resolvesStringFieldToStrFieldClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='id' type='string'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.StrField", result.get("id").get("class"));
    }

    @Test
    void resolvesNumericFieldToIntPointFieldClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='pint' class='solr.IntPointField'/>",
            "<field name='price' type='pint'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.IntPointField", result.get("price").get("class"));
    }

    @Test
    void resolvesDateFieldToDatePointFieldClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='pdate' class='solr.DatePointField'/>",
            "<field name='created' type='pdate'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.DatePointField", result.get("created").get("class"));
    }

    // ─── multiValued attribute ────────────────────────────────────────────────

    @Test
    void defaultsMultiValuedToFalseWhenNotSpecified() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='id' type='string'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("false", result.get("id").get("multiValued"));
    }

    @Test
    void preservesMultiValuedTrueWhenSpecified() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='tags' type='string' multiValued='true'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("true", result.get("tags").get("multiValued"));
    }

    @Test
    void preservesMultiValuedFalseWhenExplicitlySet() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='status' type='string' multiValued='false'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("false", result.get("status").get("multiValued"));
    }

    @Test
    void innerMapContainsBothClassAndMultiValued() throws Exception {
        var xml = schemaXml(
            "<fieldType name='text_general' class='solr.TextField'/>",
            "<field name='title' type='text_general' multiValued='true'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        var meta = result.get("title");
        assertNotNull(meta);
        assertEquals("solr.TextField", meta.get("class"));
        assertEquals("true",           meta.get("multiValued"));
    }

    // ─── Custom fieldType resolution ──────────────────────────────────────────

    @Test
    void resolvesCustomTextTypeViaClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='my_custom_text' class='solr.TextField'/>",
            "<field name='description' type='my_custom_text'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.TextField", result.get("description").get("class"));
    }

    @Test
    void resolvesCustomExactTypeWithMisleadingName() throws Exception {
        // Type named "text_acs" but backed by IntPointField — class wins
        var xml = schemaXml(
            "<fieldType name='text_acs' class='solr.IntPointField'/>",
            "<field name='score' type='text_acs'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("solr.IntPointField", result.get("score").get("class"));
    }

    @Test
    void resolvesFullyQualifiedClassName() throws Exception {
        var xml = schemaXml(
            "<fieldType name='mytext' class='org.apache.solr.schema.TextField'/>",
            "<field name='body' type='mytext'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals("org.apache.solr.schema.TextField", result.get("body").get("class"));
    }

    // ─── Multiple fields ──────────────────────────────────────────────────────

    @Test
    void resolvesMultipleFieldsWithDifferentTypes() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string'       class='solr.StrField'/>",
            "<fieldType name='text_general' class='solr.TextField'/>",
            "<fieldType name='pint'         class='solr.IntPointField'/>",
            "<field name='id'       type='string'/>",
            "<field name='title'    type='text_general' multiValued='true'/>",
            "<field name='quantity' type='pint'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertEquals(3, result.size());
        assertEquals("solr.StrField",      result.get("id").get("class"));
        assertEquals("false",              result.get("id").get("multiValued"));
        assertEquals("solr.TextField",     result.get("title").get("class"));
        assertEquals("true",               result.get("title").get("multiValued"));
        assertEquals("solr.IntPointField", result.get("quantity").get("class"));
        assertEquals("false",              result.get("quantity").get("multiValued"));
    }

    // ─── Empty class attribute ────────────────────────────────────────────────

    @Test
    void skipsFieldWhenFieldTypeHasNoClass() throws Exception {
        var xml = schemaXml(
            "<fieldType name='mystery'/>",
            "<field name='x' type='mystery'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertFalse(result.containsKey("x"));
    }

    @Test
    void skipsFieldWhenFieldTypeNotFoundInSchema() throws Exception {
        var xml = schemaXml(
            "<field name='x' type='undeclared_type'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertFalse(result.containsKey("x"));
    }

    // ─── Error handling ───────────────────────────────────────────────────────

    @Test
    void returnsEmptyForMissingFile() {
        var result = SolrSchemaProvider.fromXmlFile(Path.of("/nonexistent/managed-schema.xml"));
        assertTrue(result.isEmpty());
    }

    @Test
    void returnsEmptyForNullPath() {
        var result = SolrSchemaProvider.fromXmlFile(null);
        assertTrue(result.isEmpty());
    }

    @Test
    void returnsEmptyForMalformedXml() throws Exception {
        var xml = tempDir.resolve("bad.xml");
        Files.writeString(xml, "not xml at all");

        var result = SolrSchemaProvider.fromXmlFile(xml);
        assertTrue(result.isEmpty());
    }

    @Test
    void skipsFieldsWithEmptyNameOrType() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='' type='string'/>",
            "<field name='id' type=''/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertTrue(result.isEmpty());
    }

    // ─── Result is immutable ──────────────────────────────────────────────────

    @Test
    void resultMapIsImmutable() throws Exception {
        var xml = schemaXml(
            "<fieldType name='string' class='solr.StrField'/>",
            "<field name='id' type='string'/>"
        );

        var result = SolrSchemaProvider.fromXmlFile(xml);

        assertFalse(result.isEmpty());
        assertThrows(
            UnsupportedOperationException.class,
            () -> result.put("extra", Map.of("class", "solr.StrField", "multiValued", "false"))
        );
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private Path schemaXml(String... elements) throws Exception {
        var xml = tempDir.resolve("managed-schema.xml");
        var body = String.join("\n", elements);
        Files.writeString(xml, """
            <?xml version="1.0" encoding="UTF-8" ?>
            <schema name="test" version="1.6">
            """ + body + """
            </schema>
            """);
        return xml;
    }
}
