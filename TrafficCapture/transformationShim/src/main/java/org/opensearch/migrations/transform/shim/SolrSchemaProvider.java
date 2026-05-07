package org.opensearch.migrations.transform.shim;

import javax.xml.parsers.DocumentBuilderFactory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

/**
 * Reads Solr field metadata from a {@code managed-schema.xml} and emits a
 * {@code fieldName → { "class": fieldTypeClass, "multiValued": "true"|"false" }} map
 * for the JS transformer.
 *
 * <p>The inner map is extensible — future field properties can be added without
 * changing the outer map structure.
 *
 * <p>The JS transformer uses:
 * <ul>
 *   <li>{@code class.includes("TextField")} → analyzed → {@code match} query (fieldRule)</li>
 *   <li>{@code multiValued === "true"} → wrap in array (hits-to-docs)</li>
 * </ul>
 *
 * <p>Example schema:
 * <pre>{@code
 * <fieldType name="text_general" class="solr.TextField" .../>
 * <fieldType name="string"       class="solr.StrField"  .../>
 * <field name="title"    type="text_general" multiValued="false"/>
 * <field name="tags"     type="string"       multiValued="true"/>
 * <field name="id"       type="string"/>
 * }</pre>
 *
 * <p>Output:
 * <pre>{@code
 * {
 *   "title": { "class": "solr.TextField", "multiValued": "false" },
 *   "tags":  { "class": "solr.StrField",  "multiValued": "true"  },
 *   "id":    { "class": "solr.StrField",  "multiValued": "false" }
 * }
 * }</pre>
 */
@Slf4j
public class SolrSchemaProvider {

    private SolrSchemaProvider() {}

    /**
     * Parse a Solr {@code managed-schema.xml} and return a
     * {@code fieldName → { "class": ..., "multiValued": ... }} map.
     *
     * <p>Returns an empty map if the path is null, the file does not exist, or parsing fails.
     *
     * @param path path to {@code managed-schema.xml} or {@code managed-schema}
     * @return immutable map of field name to field metadata
     */
    public static Map<String, Map<String, String>> fromXmlFile(Path path) {
        if (path == null) {
            log.debug("solrSchemaXmlFile not configured, skipping fieldTypes");
            return Map.of();
        }
        if (!Files.exists(path)) {
            log.debug("managed-schema.xml not found at {}, skipping fieldTypes", path);
            return Map.of();
        }
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            var doc = factory.newDocumentBuilder().parse(path.toFile());
            var root = doc.getDocumentElement();

            // Step 1: build typeName → class from <fieldType> elements.
            var typeNameToClass = buildTypeClassMap(root);

            // Step 2: walk <field> elements and resolve each to its metadata.
            // Fields whose type is not declared in <fieldType> elements are skipped —
            // the JS transformer treats absent fields as unknown and falls back to match.
            var result = new LinkedHashMap<String, Map<String, String>>();
            NodeList fields = root.getElementsByTagName("field");
            for (int i = 0; i < fields.getLength(); i++) {
                if (!(fields.item(i) instanceof Element el)) continue;
                var name = el.getAttribute("name");
                var type = el.getAttribute("type");
                if (!name.isEmpty() && !type.isEmpty()) {
                    var cls = typeNameToClass.get(type);
                    if (cls != null && !cls.isEmpty()) {
                        var multiValued = el.getAttribute("multiValued");
                        // Default multiValued to "false" when not specified
                        var multiValuedStr = multiValued.isEmpty() ? "false" : multiValued;
                        result.put(name, Map.of("class", cls, "multiValued", multiValuedStr));
                    } else {
                        log.debug("Field '{}' references unknown fieldType '{}', skipping", name, type);
                    }
                }
            }

            log.info("Loaded {} field metadata entries from {}", result.size(), path);
            return Map.copyOf(result);
        } catch (Exception e) {
            log.warn("Failed to parse managed-schema.xml at {}", path, e);
            return Map.of();
        }
    }

    /**
     * Build a map of Solr fieldType name → Java class from {@code <fieldType>} elements.
     */
    private static Map<String, String> buildTypeClassMap(Element root) {
        var map = new LinkedHashMap<String, String>();
        NodeList fieldTypes = root.getElementsByTagName("fieldType");
        for (int i = 0; i < fieldTypes.getLength(); i++) {
            if (!(fieldTypes.item(i) instanceof Element el)) continue;
            var name = el.getAttribute("name");
            var cls  = el.getAttribute("class");
            if (!name.isEmpty()) {
                map.put(name, cls);
            }
        }
        return map;
    }
}
